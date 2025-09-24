import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as path from "path";

import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as appsync from "aws-cdk-lib/aws-appsync";
import * as cognito from "aws-cdk-lib/aws-cognito";
import { NagSuppressions } from "cdk-nag";

export interface ApiStackProps extends cdk.StackProps {
  userPool: cognito.IUserPool;
}

export class ApiStack extends cdk.Stack {
  public readonly api: appsync.GraphqlApi;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    // AppSync log group & minimal role
    const apiLogs = new logs.LogGroup(this, "AppSyncLogs", {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const apiLogsRole = new iam.Role(this, "AppSyncLogsRole", {
      assumedBy: new iam.ServicePrincipal("appsync.amazonaws.com"),
    });
    apiLogsRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["logs:CreateLogStream", "logs:PutLogEvents"],
        resources: [apiLogs.logGroupArn, `${apiLogs.logGroupArn}:*`],
      })
    );

    this.api = new appsync.GraphqlApi(this, "GraphqlApi", {
      name: "lala-api",
      definition: appsync.Definition.fromFile(path.join(__dirname, "schema.graphql")),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.USER_POOL,
          userPoolConfig: { userPool: props.userPool },
        },
      },
      xrayEnabled: true,
      logConfig: {
        fieldLogLevel: appsync.FieldLogLevel.ERROR,
        retention: logs.RetentionDays.ONE_MONTH,
        role: apiLogsRole,
      },
    });

    // Hello Lambda: explicit logs & role
    const helloLogs = new logs.LogGroup(this, "HelloFnLogs", {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const helloRole = new iam.Role(this, "HelloFnRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
    });
    helloRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["logs:CreateLogStream", "logs:PutLogEvents"],
        resources: [helloLogs.logGroupArn, `${helloLogs.logGroupArn}:*`],
      })
    );

    const helloFn = new lambda.Function(this, "HelloFn", {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      handler: "index.handler",
      role: helloRole,
      logGroup: helloLogs,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      // reservedConcurrentExecutions: 5, // ← removed so function scales with account concurrency
      environment: { NODE_ENV: "production" },
      code: lambda.Code.fromInline(`
        exports.handler = async () => ({
          statusCode: 200,
          body: JSON.stringify({ hello: "Bestie from Lala API" })
        });
      `),
    });

    // AppSync -> Lambda DS with scoped role
    const dsRole = new iam.Role(this, "HelloDSRole", {
      assumedBy: new iam.ServicePrincipal("appsync.amazonaws.com"),
    });
    dsRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["lambda:InvokeFunction"],
        resources: [helloFn.functionArn],
      })
    );

    const ds = new appsync.LambdaDataSource(this, "HelloDS", {
      api: this.api,
      lambdaFunction: helloFn,
      serviceRole: dsRole,
    });

    ds.createResolver("HelloResolver", { typeName: "Query", fieldName: "hello" });

    // cdk-nag suppressions
    [helloRole, apiLogsRole].forEach((r) =>
      NagSuppressions.addResourceSuppressions(r, [
        {
          id: "AwsSolutions-IAM5",
          reason:
            "logs:PutLogEvents requires logStream ARN (logGroupArn:*) - scoped to the specific group's ARN only.",
          appliesTo: ["Resource::<HelloFnLogs70155296.Arn>:*", "Resource::<AppSyncLogsCCE5E618.Arn>:*"],
        },
      ])
    );

    NagSuppressions.addResourceSuppressions(
      this.api,
      [
        {
          id: "AwsSolutions-IAM4",
          reason:
            "AppSync may attach AWSAppSyncPushToCloudWatchLogs to a service-created role even when a custom role is provided; acceptable managed policy for service logging.",
          appliesTo: [
            "Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSAppSyncPushToCloudWatchLogs",
          ],
        },
      ],
      true
    );

    new cdk.CfnOutput(this, "GraphqlUrl", { value: this.api.graphqlUrl });
  }
}

