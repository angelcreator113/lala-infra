import * as fs from "fs";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

import * as s3 from "aws-cdk-lib/aws-s3";
import * as iam from "aws-cdk-lib/aws-iam";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as targets from "aws-cdk-lib/aws-route53-targets";
import * as wafv2 from "aws-cdk-lib/aws-wafv2";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cw_actions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";

export interface WebStackProps extends cdk.StackProps {
  siteBucketName?: string;
  rootDomainName?: string;   // e.g. "stylingadventures.com"
  appSubdomain?: string;     // e.g. "app"
  rateLimitPer5m?: number;   // e.g. 2000 req/5m per IP
  notifyEmails?: string[];   // SNS subscription emails
}

export class WebStack extends cdk.Stack {
  public readonly bucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: WebStackProps = {}) {
    super(scope, id, props);

    const rootDomain = props.rootDomainName ?? "stylingadventures.com";
    const appSubdomain = props.appSubdomain ?? "app";
    const appDomain = `${appSubdomain}.${rootDomain}`;
    const rateLimitPer5m = props.rateLimitPer5m ?? 2000;
    const notifyEmails = props.notifyEmails ?? ["evonifoster@yahoo.com"];

    // ---------------- Route53 & ACM cert (us-east-1 for CloudFront) ----------------
    const zone = route53.HostedZone.fromLookup(this, "Zone", { domainName: rootDomain });

    const cfCert = new acm.Certificate(this, "AppCFCert", {
      domainName: appDomain,
      validation: acm.CertificateValidation.fromDns(zone),
    });

    // ---------------- Site bucket ----------------
    this.bucket = new s3.Bucket(this, "SiteBucket", {
      bucketName: props.siteBucketName,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      autoDeleteObjects: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      cors: [{
        allowedOrigins: [`https://${appDomain}`, "http://localhost:3000"],
        allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.HEAD],
        allowedHeaders: ["*"],
        exposedHeaders: ["ETag", "x-amz-request-id", "x-amz-version-id"],
        maxAge: 600,
      }],
    });

    // ---------------- CloudFront logs bucket ----------------
    const logsBucket = new s3.Bucket(this, "CfLogsBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      autoDeleteObjects: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      lifecycleRules: [
        {
          transitions: [{ storageClass: s3.StorageClass.GLACIER, transitionAfter: cdk.Duration.days(45) }],
          expiration: cdk.Duration.days(365),
        },
      ],
    });
    // Force TLS for access to logs
    logsBucket.addToResourcePolicy(new iam.PolicyStatement({
      effect: iam.Effect.DENY,
      principals: [new iam.AnyPrincipal()],
      actions: ["s3:*"],
      resources: [logsBucket.bucketArn, `${logsBucket.bucketArn}/*`],
      conditions: { Bool: { "aws:SecureTransport": "false" } },
    }));

    // ---------------- CloudFront (use OAI for compatibility) ----------------
    const oai = new cloudfront.OriginAccessIdentity(this, "OAI");
    this.bucket.grantRead(oai);

    this.distribution = new cloudfront.Distribution(this, "Distribution", {
      defaultRootObject: "index.html",
      certificate: cfCert,
      domainNames: [appDomain],
      enableLogging: true,
      logBucket: logsBucket,
      logFilePrefix: "cf/",
      defaultBehavior: {
        origin: new origins.S3Origin(this.bucket, { originAccessIdentity: oai }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        // IMPORTANT: use the managed policy constant (no `new`)
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
      },
      // SPA fallback
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: "/index.html", ttl: cdk.Duration.seconds(1) },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: "/index.html", ttl: cdk.Duration.seconds(1) },
      ],
    });

    // ---- WAF (managed sets + optional rate limit) ----
    const blockManaged = (this.node.tryGetContext("wafBlock") ?? "false") === "true"; // default COUNT
    const rateLimit = Number(this.node.tryGetContext("rateLimit") ?? 2000); // req per 5m per IP

    const waf = new wafv2.CfnWebACL(this, "AppWebAcl", {
      defaultAction: { allow: {} },
      scope: "CLOUDFRONT",
      name: "AppWebAcl",
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: "app-waf",
        sampledRequestsEnabled: true,
      },
      rules: [
        // Managed rule groups in COUNT/BLOCK (overrideAction drives count-only)
        ...[
          "AWSManagedRulesCommonRuleSet",
          "AWSManagedRulesKnownBadInputsRuleSet",
          "AWSManagedRulesSQLiRuleSet",
          "AWSManagedRulesAmazonIpReputationList",
        ].map((name, i) =>
          ({
            name,
            priority: 10 + i,
            statement: { managedRuleGroupStatement: { vendorName: "AWS", name } },
            overrideAction: (blockManaged ? { none: {} } : { count: {} }),
            visibilityConfig: {
              cloudWatchMetricsEnabled: true,
              metricName: `waf-${name}`,
              sampledRequestsEnabled: true,
            },
          }) as wafv2.CfnWebACL.RuleProperty
        ),

        // Optional rate-based rule
        rateLimit > 0 ? ({
          name: "RateLimitPerIp",
          priority: 50,
          statement: { rateBasedStatement: { aggregateKeyType: "IP", limit: rateLimit } },
          action: blockManaged ? { block: {} } : { count: {} },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: "waf-rate-limit",
            sampledRequestsEnabled: true,
          },
        } as wafv2.CfnWebACL.RuleProperty) : undefined,
      ].filter(Boolean) as wafv2.CfnWebACL.RuleProperty[],
    });

    // Associate WAF to CloudFront via Distribution config (DON'T use CfnWebACLAssociation for CloudFront)
    const cfnDist = this.distribution.node.defaultChild as cloudfront.CfnDistribution;
    cfnDist.addPropertyOverride("DistributionConfig.WebACLId", waf.attrArn);

    // ---------------- DNS ----------------
    new route53.ARecord(this, "AppAliasA", {
      zone,
      recordName: appDomain,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(this.distribution)),
    });
    new route53.AaaaRecord(this, "AppAliasAAAA", {
      zone,
      recordName: appDomain,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(this.distribution)),
    });

    // ---------------- Deploy assets ----------------
    const assetsDeployment = new s3deploy.BucketDeployment(this, "DeployAssets", {
      sources: [s3deploy.Source.asset("site", { exclude: ["index.html"] })],
      destinationBucket: this.bucket,
      distribution: this.distribution,
      distributionPaths: ["/assets/*", "/favicon.ico"],
      cacheControl: [
        s3deploy.CacheControl.setPublic(),
        s3deploy.CacheControl.maxAge(cdk.Duration.days(365)),
        s3deploy.CacheControl.immutable(),
      ],
      prune: false,
    });

    // robots.txt + sitemap.xml
    const robotsTxt = `User-agent: *
Allow: /
Sitemap: https://${appDomain}/sitemap.xml
`;
    const today = new Date().toISOString().slice(0, 10);
    const sitemapXml =
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://${appDomain}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
</urlset>`;

    const htmlDeployment = new s3deploy.BucketDeployment(this, "DeployHtml", {
      sources: [
        s3deploy.Source.data("index.html", fs.readFileSync("site/index.html", "utf8")),
        s3deploy.Source.data("robots.txt", robotsTxt),
        s3deploy.Source.data("sitemap.xml", sitemapXml),
      ],
      destinationBucket: this.bucket,
      distribution: this.distribution,
      distributionPaths: ["/", "/index.html", "/robots.txt", "/sitemap.xml"],
      cacheControl: [
        s3deploy.CacheControl.setPublic(),
        s3deploy.CacheControl.maxAge(cdk.Duration.minutes(5)),
        s3deploy.CacheControl.mustRevalidate(),
      ],
      prune: false,
    });
    htmlDeployment.node.addDependency(assetsDeployment);

    // ---------------- Alarms + SNS ----------------
    const topic = new sns.Topic(this, "AlertsTopic", { displayName: "Lala CloudFront Alerts" });
    new cdk.CfnOutput(this, "AlertsTopicArn", { value: topic.topicArn });
    notifyEmails.forEach(e => topic.addSubscription(new subs.EmailSubscription(e)));

    const distId = this.distribution.distributionId;

    const metric4xx = new cloudwatch.Metric({
      namespace: "AWS/CloudFront",
      metricName: "4xxErrorRate",
      statistic: "Average",
      period: cdk.Duration.minutes(5),
      dimensionsMap: { DistributionId: distId, Region: "Global" },
    });
    const metric5xx = new cloudwatch.Metric({
      namespace: "AWS/CloudFront",
      metricName: "5xxErrorRate",
      statistic: "Average",
      period: cdk.Duration.minutes(5),
      dimensionsMap: { DistributionId: distId, Region: "Global" },
    });

    const alarm4xx = new cloudwatch.Alarm(this, "High4xx", {
      metric: metric4xx,
      threshold: 5, // 5% for 3 periods
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: "4xx error rate >= 5% (CloudFront)",
    });
    const alarm5xx = new cloudwatch.Alarm(this, "High5xx", {
      metric: metric5xx,
      threshold: 1, // 1% for 3 periods
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: "5xx error rate >= 1% (CloudFront)",
    });

    const snsAction = new cw_actions.SnsAction(topic);
    alarm4xx.addAlarmAction(snsAction);
    alarm5xx.addAlarmAction(snsAction);

    // ---------------- Outputs ----------------
    new cdk.CfnOutput(this, "SiteUrl", { value: `https://${appDomain}` });
    new cdk.CfnOutput(this, "CfDomainFallback", { value: `https://${this.distribution.distributionDomainName}` });
    new cdk.CfnOutput(this, "LogsBucketName", { value: logsBucket.bucketName });
    new cdk.CfnOutput(this, "WebAclArn", { value: waf.attrArn });
  }
}
