import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as iam from "aws-cdk-lib/aws-iam";

export interface SiteBucketProps {
  appDomain: string;
}

export class SiteBucket extends Construct {
  readonly bucket: s3.Bucket;
  readonly logs: s3.Bucket;

  constructor(scope: Construct, id: string, props: SiteBucketProps) {
    super(scope, id);

    // access logs bucket
    this.logs = new s3.Bucket(this, "S3AccessLogsBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      lifecycleRules: [{ expiration: cdk.Duration.days(365) }],
    });
    this.logs.addToResourcePolicy(new iam.PolicyStatement({
      effect: iam.Effect.DENY,
      principals: [new iam.AnyPrincipal()],
      actions: ["s3:*"],
      resources: [this.logs.bucketArn, `${this.logs.bucketArn}/*`],
      conditions: { Bool: { "aws:SecureTransport": "false" } },
    }));

    // site bucket
    this.bucket = new s3.Bucket(this, "SiteBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      autoDeleteObjects: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      serverAccessLogsBucket: this.logs,
      serverAccessLogsPrefix: "site/",
      cors: [{
        allowedOrigins: [`https://${props.appDomain}`, "http://localhost:3000"],
        allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.HEAD],
        allowedHeaders: ["*"],
        exposedHeaders: ["ETag", "x-amz-request-id", "x-amz-version-id"],
        maxAge: 600,
      }],
    });
  }
}
