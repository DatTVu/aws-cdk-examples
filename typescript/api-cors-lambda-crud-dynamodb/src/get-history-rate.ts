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

export const handler = async (event: any = {}): Promise<any> => {
  const requestedDate =
    typeof event.pathParameters.date == "string"
      ? event.pathParameters.date
      : event.pathParameters.date.toString();

  if (!requestedDate) {
    return {
      statusCode: 400,
      body: `Error: You are missing the path parameter date`,
    };
  }

  const dbparams = {
    TableName: TABLE_NAME,
    Key: {
      [PRIMARY_KEY]: requestedDate,
    },
  };
  //Connect to db and find the "lastest" exchangeResponse.
  //If not found, create new entry.
  //If found, update with newer value.
  const dbReponse = await db.get(dbparams).promise();
  if (dbReponse.Item !== undefined && dbReponse.Item !== null) {
    return { statusCode: 200, body: JSON.stringify(dbReponse.Item) };
  } else {
    return await createItemFunction(requestedDate);
  }
};

async function createItemFunction(date: string): Promise<any> {
  var exchangeResponse;
  try {
    exchangeResponse = await fixer.forDate(date);
  } catch (apiError) {
    return { statusCode: 500, body: JSON.stringify(apiError) };
  }

  //Convert exchange rate response into object so we can handle it
  const exchangeRate: any =
    typeof exchangeResponse == "object"
      ? exchangeResponse
      : JSON.parse(exchangeResponse);

  //Delete Unneccessary Properties
  delete exchangeRate.success;
  delete exchangeRate.timestamp;
  delete exchangeRate.historical;

  //set primary key of the item to be "latest"
  exchangeRate[PRIMARY_KEY] = exchangeRate.date;
  const createParams = {
    TableName: TABLE_NAME,
    Item: exchangeRate,
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
    return { statusCode: 500, body: { errorResponse, dbError } };
  }
}
