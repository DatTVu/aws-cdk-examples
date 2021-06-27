const AWS = require("aws-sdk");
const db = new AWS.DynamoDB.DocumentClient();
const TABLE_NAME = process.env.TABLE_NAME || "";
const PRIMARY_KEY = process.env.PRIMARY_KEY || "";
import fixer = require("fixer-api");

//TO-DO: put accessKey in .env or use AWS to manage this. This is bad pratice!
fixer.set({ accessKey: "0bb650dfb9173020a14be3fe10da570e" });

//TO-DO: put all these constants in a constants.js file. These will be reused a lot!
const RESERVED_RESPONSE = `Error: You're using AWS reserved keywords as attributes`,
  DYNAMODB_EXECUTION_ERROR = `Error: Execution update, caused a Dynamodb error, please take a look at your CloudWatch Logs.`;
const CURRENCY_LATEST_KEY = "lastest";
const BASE_PROPERTY_KEY = "base";

export const handler = async (): Promise<any> => {
  //Call fixer-api to get the latest currency exchange rate
  var exchangeResponse;
  try {
    exchangeResponse = await fixer.latest();
  } catch (apiError) {
    return { statusCode: 500, body: JSON.stringify(apiError) };
  }

  //Convert exchange rate response into object so we can handle it
  const editedItem: any =
    typeof exchangeResponse == "object"
      ? exchangeResponse
      : JSON.parse(exchangeResponse);

  //Delete Unneccessary Properties
  delete editedItem.success;
  delete editedItem.timestamp;

  //Table name and primary key to save our exchangeResponse
  const dbparams = {
    TableName: TABLE_NAME,
    Key: {
      [PRIMARY_KEY]: CURRENCY_LATEST_KEY,
    },
  };

  //Connect to db and find the "lastest" exchangeResponse.
  //If not found, create new entry.
  //If found, update with newer value.
  const dbReponse = await db.get(dbparams).promise();
  if (dbReponse.Item !== undefined && dbReponse.Item !== null) {
    return await updateItemFunction(exchangeResponse, editedItem);
  } else {
    return await createItemFunction(editedItem);
  }
};

async function createItemFunction(item: any): Promise<any> {
  //set primary key of the item to be "latest"
  item[PRIMARY_KEY] = CURRENCY_LATEST_KEY;
  const createParams = {
    TableName: TABLE_NAME,
    Item: item,
  };

  //try to create a new entry
  //return 201 if success
  //return 500 if failed
  try {
    await db.put(createParams).promise();
    return { statusCode: 201, body: "" };
  } catch (dbError) {
    const errorResponse =
      dbError.code === "ValidationException" &&
      dbError.message.includes("reserved keyword")
        ? DYNAMODB_EXECUTION_ERROR
        : RESERVED_RESPONSE;
    return { statusCode: 500, body: errorResponse };
  }
}

//@Param: currencyExchangeResponse: typeof Json: newer exchange response we fetch using fixer-api
//@Param: updatedItem: typeof Object: newer exchange response casted to Object to handle business logic
async function updateItemFunction(
  currencyExchangeResponse: any,
  updatedItem: any
): Promise<any> {
  //Count how many keys the response has. If there is none, we don't have to update anything. Just return
  const editedItemProperties = Object.keys(currencyExchangeResponse);
  if (editedItemProperties.length < 1) {
    return {
      statusCode: 400,
      body: "invalid request!",
    };
  }

  //DynamoDB has certain reserved keywords.
  //"base" is one of them. So to use "base"
  //in our update, we have to use ExpressionAttributeValues
  //and ExpressionAttributeNames as placeholders.
  //Reference: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.ExpressionAttributeNames.html
  const basePropertyIdx = editedItemProperties.indexOf(BASE_PROPERTY_KEY, 0);
  if (basePropertyIdx > -1) {
    editedItemProperties.splice(basePropertyIdx, 1);
  }
  const updateParams: any = {
    TableName: TABLE_NAME,
    Key: {
      [PRIMARY_KEY]: CURRENCY_LATEST_KEY,
    },
    UpdateExpression: `set #base = :val1`,
    ExpressionAttributeValues: {
      ":val1": updatedItem[BASE_PROPERTY_KEY],
    },
    ExpressionAttributeNames: {
      "#base": BASE_PROPERTY_KEY,
    },
    ReturnValues: "UPDATED_NEW",
  };

  editedItemProperties.forEach((property) => {
    updateParams.UpdateExpression += `, #${property} = :${property}`;
    updateParams.ExpressionAttributeValues[`:${property}`] =
      updatedItem[property];
    updateParams.ExpressionAttributeNames[`#${property}`] = property;
  });

  //Update the entry with new value
  try {
    await db.update(updateParams).promise();
    return { statusCode: 204, body: "" };
  } catch (dbError) {
    const exchangeResponse =
      dbError.code === "ValidationException" &&
      dbError.message.includes("reserved keyword")
        ? DYNAMODB_EXECUTION_ERROR
        : RESERVED_RESPONSE;
    return {
      statusCode: 500,
      body: {
        exchangeResponse,
        dbError,
      },
    };
  }
}
