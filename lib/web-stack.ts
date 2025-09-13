import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as targets from "aws-cdk-lib/aws-route53-targets";

export interface WebStackProps extends cdk.StackProps {
  siteBucketName?: string;
  /**
   * Root hosted zone (e.g., "stylingadventures.com").
   * Defaults to "stylingadventures.com".
   */
  rootDomainName?: string;
  /**
   * Subdomain to host the app (e.g., "app" -> "app.stylingadventures.com").
   * Defaults to "app".
   */
  appSubdomain?: string;
}

export class WebStack extends cdk.Stack {
  public readonly bucket!: s3.Bucket; // definite assignment in ctor
  public readonly distribution!: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props?: WebStackProps) {
    super(scope, id, props);

    // ----- Domain settings -----
    const rootDomain = props?.rootDomainName ?? "stylingadventures.com";
    const appSubdomain = props?.appSubdomain ?? "app";
    const appDomain = `${appSubdomain}.${rootDomain}`;

    // Look up hosted zone created for the domain
    const zone = route53.HostedZone.fromLookup(this, "Zone", {
      domainName: rootDomain,
    });

    // ----- S3 bucket for the site -----
    this.bucket = new s3.Bucket(this, "SiteBucket", {
      bucketName: props?.siteBucketName,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Strict S3 CORS: only your branded app domain + localhost (dev)
    this.bucket.addCorsRule({
      allowedOrigins: [`https://${appDomain}`, "http://localhost:3000"],
      allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.HEAD],
      allowedHeaders: ["content-type"],
      exposedHeaders: ["ETag", "x-amz-request-id", "x-amz-version-id"],
      maxAge: 600,
    });

    // ----- CloudFront with OAI -----
    const oai = new cloudfront.OriginAccessIdentity(this, "OAI");
    this.bucket.grantRead(oai);

    // CloudFront must use an ACM cert in us-east-1
    const cfCert = new acm.DnsValidatedCertificate(this, "AppCFCert", {
      domainName: appDomain,
      hostedZone: zone,
      region: "us-east-1",
    });

    this.distribution = new cloudfront.Distribution(this, "Distribution", {
      defaultBehavior: {
        origin: new origins.S3Origin(this.bucket, { originAccessIdentity: oai }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: "index.html",
      domainNames: [appDomain],
      certificate: cfCert,
    });

    // ----- Route 53 aliases to CloudFront -----
    new route53.ARecord(this, "AppAliasA", {
      zone,
      recordName: appDomain,
      target: route53.RecordTarget.fromAlias(
        new targets.CloudFrontTarget(this.distribution)
      ),
    });
    new route53.AaaaRecord(this, "AppAliasAAAA", {
      zone,
      recordName: appDomain,
      target: route53.RecordTarget.fromAlias(
        new targets.CloudFrontTarget(this.distribution)
      ),
    });

    // ----- Deploy site assets -----
    // 1) Everything except index.html (long cache)
    new s3deploy.BucketDeployment(this, "DeployAssets", {
      sources: [s3deploy.Source.asset("site", { exclude: ["index.html"] })],
      destinationBucket: this.bucket,
      distribution: this.distribution,
      distributionPaths: ["/assets/*", "/favicon.ico"],
      cacheControl: [
        s3deploy.CacheControl.setPublic(),
        s3deploy.CacheControl.maxAge(cdk.Duration.days(365)),
        s3deploy.CacheControl.immutable(),
      ],
      prune: true,
    });

    // 2) Only index.html (short cache; do not prune)
    new s3deploy.BucketDeployment(this, "DeployHtml", {
      sources: [s3deploy.Source.asset("site", { exclude: ["**", "!index.html"] })],
      destinationBucket: this.bucket,
      distribution: this.distribution,
      distributionPaths: ["/index.html", "/"],
      cacheControl: [
        s3deploy.CacheControl.setPublic(),
        s3deploy.CacheControl.maxAge(cdk.Duration.minutes(5)),
        s3deploy.CacheControl.mustRevalidate(),
      ],
      prune: false,
    });

    new cdk.CfnOutput(this, "SiteUrl", { value: `https://${appDomain}` });
    new cdk.CfnOutput(this, "CfDomainFallback", {
      value: `https://${this.distribution.distributionDomainName}`,
    });
  }
}

