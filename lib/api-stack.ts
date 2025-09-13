import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as path from "path";
import * as appsync from "aws-cdk-lib/aws-appsync";
import * as cognito from "aws-cdk-lib/aws-cognito";

export interface ApiStackProps extends cdk.StackProps {
  userPool: cognito.IUserPool;
}

export class ApiStack extends cdk.Stack {
  public readonly api: appsync.GraphqlApi;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    this.api = new appsync.GraphqlApi(this, "GraphqlApi", {
      name: "lala-api",
      schema: appsync.SchemaFile.fromAsset(path.join(__dirname, "schema.graphql")),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.USER_POOL,
          userPoolConfig: { userPool: props.userPool }
        }
      },
      xrayEnabled: true
    });

    const helloFn = new lambda.Function(this, "HelloFn", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: lambda.Code.fromInline(`
        exports.handler = async () => ({ statusCode: 200, body: JSON.stringify({ hello: "Bestie from Lala API" }) });
      `)
    });

    const ds = new appsync.LambdaDataSource(this, "HelloDS", {
      api: this.api,
      lambdaFunction: helloFn
    });

    ds.createResolver("HelloResolver", {
      typeName: "Query",
      fieldName: "hello"
    });

    new cdk.CfnOutput(this, "GraphqlUrl", { value: this.api.graphqlUrl });
  }
}

