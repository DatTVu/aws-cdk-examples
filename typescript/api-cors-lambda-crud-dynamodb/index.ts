import events = require("@aws-cdk/aws-events");
import targets = require("@aws-cdk/aws-events-targets");
import apigateway = require("@aws-cdk/aws-apigateway");
import dynamodb = require("@aws-cdk/aws-dynamodb");
import lambda = require("@aws-cdk/aws-lambda");
import cdk = require("@aws-cdk/core");

export class ApiLambdaCrudDynamoDBStack extends cdk.Stack {
  constructor(app: cdk.App, id: string) {
    super(app, id);

    const dynamoTable = new dynamodb.Table(this, "items", {
      partitionKey: {
        name: "itemId",
        type: dynamodb.AttributeType.STRING,
      },
      tableName: "items",

      // The default removal policy is RETAIN, which means that cdk destroy will not attempt to delete
      // the new table, and it will remain in your account until manually deleted. By setting the policy to
      // DESTROY, cdk destroy will delete the table (even if it has data in it)
      removalPolicy: cdk.RemovalPolicy.DESTROY, // NOT recommended for production code
    });

    const getOneLambda = new lambda.Function(this, "getOneItemFunction", {
      code: new lambda.AssetCode("src"),
      handler: "get-one.handler",
      runtime: lambda.Runtime.NODEJS_10_X,
      environment: {
        TABLE_NAME: dynamoTable.tableName,
        PRIMARY_KEY: "itemId",
      },
    });

    const getAllLambda = new lambda.Function(this, "getAllItemsFunction", {
      code: new lambda.AssetCode("src"),
      handler: "get-all.handler",
      runtime: lambda.Runtime.NODEJS_10_X,
      environment: {
        TABLE_NAME: dynamoTable.tableName,
        PRIMARY_KEY: "itemId",
      },
    });

    const createOne = new lambda.Function(this, "createItemFunction", {
      code: new lambda.AssetCode("src"),
      handler: "create.handler",
      runtime: lambda.Runtime.NODEJS_10_X,
      environment: {
        TABLE_NAME: dynamoTable.tableName,
        PRIMARY_KEY: "itemId",
      },
    });

    const updateOne = new lambda.Function(this, "updateItemFunction", {
      code: new lambda.AssetCode("src"),
      handler: "update-one.handler",
      runtime: lambda.Runtime.NODEJS_10_X,
      environment: {
        TABLE_NAME: dynamoTable.tableName,
        PRIMARY_KEY: "itemId",
      },
    });

    const deleteOne = new lambda.Function(this, "deleteItemFunction", {
      code: new lambda.AssetCode("src"),
      handler: "delete-one.handler",
      runtime: lambda.Runtime.NODEJS_10_X,
      environment: {
        TABLE_NAME: dynamoTable.tableName,
        PRIMARY_KEY: "itemId",
      },
    });

    const getLatestExchangeRateLambda = new lambda.Function(
      this,
      "getLatestExchangeRateFunction",
      {
        code: new lambda.AssetCode("src"),
        handler: "get-latest.handler",
        runtime: lambda.Runtime.NODEJS_10_X,
        environment: {
          TABLE_NAME: dynamoTable.tableName,
          PRIMARY_KEY: "itemId",
        },
      }
    );

    const getHistoricalExchangeRateFunction = new lambda.Function(
      this,
      "getHistoricalExchangeRateFunction",
      {
        code: new lambda.AssetCode("src"),
        handler: "get-history-rate.handler",
        runtime: lambda.Runtime.NODEJS_10_X,
        environment: {
          TABLE_NAME: dynamoTable.tableName,
          PRIMARY_KEY: "itemId",
        },
      }
    );

    dynamoTable.grantReadWriteData(getAllLambda);
    dynamoTable.grantReadWriteData(getOneLambda);
    dynamoTable.grantReadWriteData(createOne);
    dynamoTable.grantReadWriteData(updateOne);
    dynamoTable.grantReadWriteData(deleteOne);
    dynamoTable.grantReadWriteData(getLatestExchangeRateLambda);
    dynamoTable.grantReadWriteData(getHistoricalExchangeRateFunction);

    // Run every day at 6PM UTC
    // See https://docs.aws.amazon.com/lambda/latest/dg/tutorial-scheduled-events-schedule-expressions.html
    const rule = new events.Rule(this, "Rule", {
      schedule: events.Schedule.expression("cron(0 22 ? * MON-FRI *)"),
    });

    rule.addTarget(new targets.LambdaFunction(getLatestExchangeRateLambda));

    const api = new apigateway.RestApi(this, "itemsApi", {
      restApiName: "Items Service",
    });

    const items = api.root.addResource("items");
    const getAllIntegration = new apigateway.LambdaIntegration(getAllLambda);
    items.addMethod("GET", getAllIntegration);

    const createOneIntegration = new apigateway.LambdaIntegration(createOne);
    items.addMethod("POST", createOneIntegration);

    const singleItem = items.addResource("{id}");
    const getOneIntegration = new apigateway.LambdaIntegration(getOneLambda);
    singleItem.addMethod("GET", getOneIntegration);

    const updateOneIntegration = new apigateway.LambdaIntegration(updateOne);
    singleItem.addMethod("PATCH", updateOneIntegration);

    const deleteOneIntegration = new apigateway.LambdaIntegration(deleteOne);
    singleItem.addMethod("DELETE", deleteOneIntegration);

    const currency = api.root.addResource("exchange");
    // const getLatestExchangeRateIntegration = new apigateway.LambdaIntegration(
    //   getLatestExchangeRateLambda
    // );
    // currency.addMethod("GET", getLatestExchangeRateIntegration);

    const historyRate = currency.addResource("{date}");
    const getHistoricalExchangeRateIntegration =
      new apigateway.LambdaIntegration(getHistoricalExchangeRateFunction);
    historyRate.addMethod("GET", getHistoricalExchangeRateIntegration);
  }
}

const app = new cdk.App();
new ApiLambdaCrudDynamoDBStack(app, "ApiLambdaCrudDynamoDBExample");
app.synth();
