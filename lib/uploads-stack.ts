// lib/uploads-stack.ts
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as cognito from "aws-cdk-lib/aws-cognito";

export interface UploadsStackProps extends cdk.StackProps {
  userPool: cognito.UserPool;
  allowedOrigins: string[]; // e.g. ["https://app.stylingadventures.com", "http://localhost:5173"]
}

export class UploadsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: UploadsStackProps) {
    super(scope, id, props);

    // 1) Dedicated access-logs bucket (compliant for AwsSolutions-S1)
    const uploadsAccessLogs = new s3.Bucket(this, "UploadsAccessLogs", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      autoDeleteObjects: true, // ok for dev; remove for prod
      removalPolicy: cdk.RemovalPolicy.DESTROY, // ok for dev; keep RETAIN for prod
      lifecycleRules: [{ expiration: cdk.Duration.days(365) }],
    });

    // Deny non-HTTPS on logs bucket
    uploadsAccessLogs.addToResourcePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.DENY,
        principals: [new iam.AnyPrincipal()],
        actions: ["s3:*"],
        resources: [uploadsAccessLogs.bucketArn, `${uploadsAccessLogs.bucketArn}/*`],
        conditions: { Bool: { "aws:SecureTransport": "false" } },
      })
    );

    // 2) Actual uploads bucket — WITH server access logging
    const uploadsBucket = new s3.Bucket(this, "UploadsBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      autoDeleteObjects: true, // ok for dev
      removalPolicy: cdk.RemovalPolicy.DESTROY, // ok for dev
      serverAccessLogsBucket: uploadsAccessLogs,
      serverAccessLogsPrefix: "uploads/",
      cors: [
        {
          allowedOrigins: props.allowedOrigins,
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT, s3.HttpMethods.HEAD],
          allowedHeaders: ["*"],
          exposedHeaders: ["ETag"],
          maxAge: 600,
        },
      ],
    });

    // Deny non-HTTPS on uploads bucket
    uploadsBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.DENY,
        principals: [new iam.AnyPrincipal()],
        actions: ["s3:*"],
        resources: [uploadsBucket.bucketArn, `${uploadsBucket.bucketArn}/*`],
        conditions: { Bool: { "aws:SecureTransport": "false" } },
      })
    );

    // ---- Lambda to sign S3 PUT URLs ----
    const fn = new lambda.Function(this, "SignerFn", {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: "index.handler",
      code: lambda.Code.fromInline(`
        const { S3RequestPresigner } = require("@aws-sdk/s3-request-presigner");
        const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
        const { formatUrl } = require("@aws-sdk/util-format-url");
        const client = new S3Client({});
        exports.handler = async (event) => {
          const body = JSON.parse(event.body || "{}");
          const key = body.key || ("upload-" + Date.now());
          const cmd = new PutObjectCommand({ Bucket: process.env.BUCKET, Key: key, ContentType: body.contentType || "application/octet-stream" });
          const presigner = new S3RequestPresigner({ ...client.config });
          const url = await presigner.presign(cmd, { expiresIn: 900 });
          return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ url: formatUrl(url), key }) };
        };
      `),
      timeout: cdk.Duration.seconds(10),
      environment: { BUCKET: uploadsBucket.bucketName },
      // (Optional) define a log group explicitly if you want to avoid deprecated logRetention
      // logGroup: new logs.LogGroup(this, "SignerFnLogs", { retention: logs.RetentionDays.ONE_WEEK }),
    });

    uploadsBucket.grantPut(fn);
    uploadsBucket.grantRead(fn);

    // ---- API Gateway REST (Option A) with SAME construct ID to avoid type-change error ----
    const api = new apigw.RestApi(this, "UploadsApi", {
      restApiName: "Uploads API",
      deployOptions: { stageName: "prod" },
      cloudWatchRole: true,
      defaultCorsPreflightOptions: {
        allowOrigins: props.allowedOrigins,
        allowMethods: ["OPTIONS", "POST", "GET", "PUT", "DELETE"],
        allowHeaders: ["*"],
        maxAge: cdk.Duration.days(1),
      },
    });

    // Cognito authorizer (User Pool)
    const authorizer = new apigw.CognitoUserPoolsAuthorizer(this, "UserAuthorizer", {
      cognitoUserPools: [props.userPool],
    });

    // POST /sign
    const signRes = api.root.addResource("sign", {
      defaultCorsPreflightOptions: {
        allowOrigins: props.allowedOrigins,
        allowMethods: ["OPTIONS", "POST"],
        allowHeaders: ["*"],
      },
    });

    signRes.addMethod(
      "POST",
      new apigw.LambdaIntegration(fn, { proxy: true }),
      {
        authorizer,
        authorizationType: apigw.AuthorizationType.COGNITO,
      }
    );

    // Outputs
    new cdk.CfnOutput(this, "UploadsApiUrl", { value: api.url });
    new cdk.CfnOutput(this, "UploadsBucketName", { value: uploadsBucket.bucketName });
  }
}
