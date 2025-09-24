// lib/web-stack.ts
import * as fs from "fs";
import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";

import * as s3 from "aws-cdk-lib/aws-s3";
import * as iam from "aws-cdk-lib/aws-iam";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as targets from "aws-cdk-lib/aws-route53-targets";
import * as wafv2 from "aws-cdk-lib/aws-wafv2";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cw_actions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as sns from "aws-cdk-lib/aws-sns";
import * as kms from "aws-cdk-lib/aws-kms";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import { NagSuppressions } from "cdk-nag";

import { CfSite } from "./constructs/cf-site";

export interface WebStackProps extends cdk.StackProps {
  siteBucketName?: string;
  rootDomainName?: string;
  appSubdomain?: string;
  rateLimitPer5m?: number;
  notifyEmails?: string[];
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

    const account = cdk.Stack.of(this).account;
    const region = cdk.Stack.of(this).region;

    // first deploy with -c claimAlias=false, then true
    const claimAlias = (this.node.tryGetContext("claimAlias") ?? "false") === "true";

    // ---------------- Route53 & ACM ----------------
    const zone = route53.HostedZone.fromLookup(this, "Zone", { domainName: rootDomain });
    const cfCert = claimAlias
      ? new acm.Certificate(this, "AppCFCert", {
          domainName: appDomain,
          validation: acm.CertificateValidation.fromDns(zone),
        })
      : undefined;

    // ---------------- Dedicated S3 access logs bucket ----------------
    const s3AccessLogs = new s3.Bucket(this, "S3AccessLogsBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      lifecycleRules: [{ expiration: cdk.Duration.days(365) }],
    });
    s3AccessLogs.addToResourcePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.DENY,
        principals: [new iam.AnyPrincipal()],
        actions: ["s3:*"],
        resources: [s3AccessLogs.bucketArn, `${s3AccessLogs.bucketArn}/*`],
        conditions: { Bool: { "aws:SecureTransport": "false" } },
      })
    );

    // ---------------- Site bucket ----------------
    this.bucket = new s3.Bucket(this, "SiteBucket", {
      bucketName: props.siteBucketName,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      autoDeleteObjects: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      serverAccessLogsBucket: s3AccessLogs,
      serverAccessLogsPrefix: "site/",
      cors: [
        {
          allowedOrigins: [
            `https://${appDomain}`,
            "http://localhost:3000",
            "http://localhost:5173",
          ],
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.HEAD],
          allowedHeaders: ["*"],
          exposedHeaders: ["ETag"],
          maxAge: 600,
        },
      ],
    });

    // ---------------- CloudFront logs bucket ----------------
    const cfLogsBucket = new s3.Bucket(this, "CfLogsBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      autoDeleteObjects: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      lifecycleRules: [
        {
          transitions: [
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(45),
            },
          ],
          expiration: cdk.Duration.days(365),
        },
      ],
      serverAccessLogsBucket: s3AccessLogs,
      serverAccessLogsPrefix: "cloudfront-logs/",
    });
    cfLogsBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.DENY,
        principals: [new iam.AnyPrincipal()],
        actions: ["s3:*"],
        resources: [cfLogsBucket.bucketArn, `${cfLogsBucket.bucketArn}/*`],
        conditions: { Bool: { "aws:SecureTransport": "false" } },
      })
    );

    // ---------------- WAF ----------------
    const blockManaged = (this.node.tryGetContext("wafBlock") ?? "false") === "true";
    const rateLimit = Number(this.node.tryGetContext("rateLimit") ?? rateLimitPer5m);
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
        ..."AWSManagedRulesCommonRuleSet,AWSManagedRulesKnownBadInputsRuleSet,AWSManagedRulesSQLiRuleSet,AWSManagedRulesAmazonIpReputationList"
          .split(",")
          .map(
            (name, i) =>
              ({
                name,
                priority: 10 + i,
                statement: { managedRuleGroupStatement: { vendorName: "AWS", name } },
                overrideAction: blockManaged ? { none: {} } : { count: {} },
                visibilityConfig: {
                  cloudWatchMetricsEnabled: true,
                  metricName: `waf-${name}`,
                  sampledRequestsEnabled: true,
                },
              }) as wafv2.CfnWebACL.RuleProperty
          ),
        rateLimit > 0
          ? ({
              name: "RateLimitPerIp",
              priority: 50,
              statement: { rateBasedStatement: { aggregateKeyType: "IP", limit: rateLimit } },
              action: blockManaged ? { block: {} } : { count: {} },
              visibilityConfig: {
                cloudWatchMetricsEnabled: true,
                metricName: "waf-rate-limit",
                sampledRequestsEnabled: true,
              },
            } as wafv2.CfnWebACL.RuleProperty)
          : undefined,
      ].filter(Boolean) as wafv2.CfnWebACL.RuleProperty[],
    });

    // ---------------- OAC (unique name) ----------------
    const oac = new cloudfront.CfnOriginAccessControl(this, "S3Oac", {
      originAccessControlConfig: {
        name: `${cdk.Stack.of(this).stackName}-${this.node.addr}-oac`,
        originAccessControlOriginType: "s3",
        signingBehavior: "always",
        signingProtocol: "sigv4",
        description: "OAC for S3 origin",
      },
    });

    // ---------------- CloudFront via component ----------------
    const cfSite = new CfSite(this, "CfSite", {
      bucket: this.bucket,
      domainName: claimAlias ? appDomain : undefined,
      certificate: claimAlias ? cfCert : undefined,
      logsBucket: cfLogsBucket,
      webAclArn: waf.attrArn,
      originAccessControlId: oac.attrId,
    });
    this.distribution = cfSite.distribution;

    // -------- Response Headers Policy (CSP + security headers) --------
    // NOTE: Allows inline scripts to keep your current index.html working.
    // When you move scripts to external files, you can drop 'unsafe-inline'.
    const siteCsp = new cloudfront.ResponseHeadersPolicy(this, "SiteCsp", {
      responseHeadersPolicyName: "SiteCsp",
      securityHeadersBehavior: {
        contentSecurityPolicy: {
          override: true,
          contentSecurityPolicy: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline'",
            [
              "connect-src 'self'",
              `https://*.execute-api.${region}.amazonaws.com`,
              `https://cognito-idp.${region}.amazonaws.com`,
              `https://*.auth.${region}.amazoncognito.com`,
              `https://*.appsync-api.${region}.amazonaws.com`,
              `wss://*.appsync-realtime-api.${region}.amazonaws.com`,
              "https://*.s3.amazonaws.com",
            ].join(" "),
            "img-src 'self' data: blob: https:",
            "style-src 'self' 'unsafe-inline'",
            "font-src 'self' data:",
            "frame-ancestors 'self'",
            "object-src 'none'",
            "base-uri 'self'",
            "upgrade-insecure-requests",
          ].join("; "),
        },
        strictTransportSecurity: {
          override: true,
          accessControlMaxAge: cdk.Duration.days(365),
          includeSubdomains: true,
          preload: true,
        },
        xssProtection: { override: true, protection: true, modeBlock: true },
        contentTypeOptions: { override: true },
        referrerPolicy: {
          override: true,
          referrerPolicy: cloudfront.HeadersReferrerPolicy.NO_REFERRER,
        },
      },
    });

    // Attach the ResponseHeadersPolicy to the *default* behavior using L1 escape hatch
    const cfnDist = this.distribution.node.defaultChild as cloudfront.CfnDistribution;
    cfnDist.addPropertyOverride(
      "DistributionConfig.DefaultCacheBehavior.ResponseHeadersPolicyId",
      siteCsp.responseHeadersPolicyId
    );

    // S3 policy allowing CloudFront (OAC) to read objects
    this.bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: "AllowCloudFrontServicePrincipalReadOnly",
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal("cloudfront.amazonaws.com")],
        actions: ["s3:GetObject"],
        resources: [this.bucket.arnForObjects("*")],
        conditions: { StringLike: { "AWS:SourceArn": `arn:aws:cloudfront::${account}:distribution/*` } },
      })
    );

    // ---------------- DNS records (only when alias is claimed) ----------------
    if (claimAlias) {
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
    }

    // ---------------- Deploy static assets ----------------
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

    // robots.txt + sitemap.xml + index.html
    const robotsTxt = `User-agent: *
Allow: /
Sitemap: https://${appDomain}/sitemap.xml
`;
    const today = new Date().toISOString().slice(0, 10);
    const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
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

    // ---------------- cdk-nag suppressions for BucketDeployment ----------------
    const siteBucketLogicalId = (this.bucket.node.defaultChild as s3.CfnBucket).logicalId;
    const siteBucketFindingStar = `Resource::<${siteBucketLogicalId}.Arn>/*`;
    const siteBucketFindingNoStar = `Resource::<${siteBucketLogicalId}.Arn>`;
    const assetsBucketExact = `Resource::arn:<AWS::Partition>:s3:::cdk-hnb659fds-assets-${account}-${region}/*`;
    const assetsBucketPlaceholder =
      "Resource::arn:<AWS::Partition>:s3:::cdk-hnb659fds-assets-<AWS::AccountId>-<AWS::Region>/*";

    [assetsDeployment, htmlDeployment].forEach((d) => {
      NagSuppressions.addResourceSuppressions(
        d,
        [
          {
            id: "AwsSolutions-IAM4",
            reason: "CDK BucketDeployment provider uses the AWS-managed LambdaBasicExecutionRole.",
            appliesTo: [
              "Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
            ],
          },
          {
            id: "AwsSolutions-IAM5",
            reason:
              "BucketDeployment must list/get/delete objects in the target bucket and CDK assets bucket.",
            appliesTo: [
              "Action::s3:GetObject*",
              "Action::s3:GetBucket*",
              "Action::s3:List*",
              "Action::s3:DeleteObject*",
              "Action::s3:Abort*",
              siteBucketFindingStar,
              siteBucketFindingNoStar,
              assetsBucketExact,
              assetsBucketPlaceholder,
              "Resource::*",
            ],
          },
        ],
        true
      );
    });

    for (const n of this.node.findAll()) {
      const path = (n as any).node?.path as string | undefined;
      const type = (n as any).cfnResourceType as string | undefined;
      if (!path || !type) continue;
      const isBucketDeployment = path.includes("CDKBucketDeployment");

      if (isBucketDeployment && type === "AWS::IAM::Policy" && path.endsWith("/DefaultPolicy/Resource")) {
        NagSuppressions.addResourceSuppressions(
          n as any,
          [{ id: "AwsSolutions-IAM5", reason: "Scoped to site & assets buckets during deploy/prune." }],
          true
        );
      }
      if (isBucketDeployment && type === "AWS::IAM::Role" && path.endsWith("/ServiceRole/Resource")) {
        NagSuppressions.addResourceSuppressions(
          n as any,
          [
            {
              id: "AwsSolutions-IAM4",
              reason: "CDK custom resource provider uses AWS-managed basic execution role.",
              appliesTo: [
                "Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
              ],
            },
          ],
          true
        );
      }
      if (isBucketDeployment && type === "AWS::Lambda::Function" && path.endsWith("/Resource")) {
        NagSuppressions.addResourceSuppressions(
          n as any,
          [{ id: "AwsSolutions-L1", reason: "Runtime controlled by CDK custom resource provider." }],
          true
        );
      }
    }

    // ---------------- Alerts (SNS + KMS) ----------------
    const snsKey = new kms.Key(this, "AlertsKey", { enableKeyRotation: true });
    const topic = new sns.Topic(this, "AlertsTopic", {
      displayName: "Lala CloudFront Alerts",
      masterKey: snsKey,
    });
    topic.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: "HttpsOnlyPublish",
        effect: iam.Effect.DENY,
        principals: [new iam.AnyPrincipal()],
        actions: ["sns:Publish"],
        resources: [topic.topicArn],
        conditions: { Bool: { "aws:SecureTransport": "false" } },
      })
    );
    notifyEmails.forEach((e) => topic.addSubscription(new subs.EmailSubscription(e)));
    new cdk.CfnOutput(this, "AlertsTopicArn", { value: topic.topicArn });

    // ---------------- CloudWatch alarms ----------------
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
    const snsAction = new cw_actions.SnsAction(topic);

    new cloudwatch.Alarm(this, "High4xx", {
      metric: metric4xx,
      threshold: 5,
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: "4xx error rate >= 5% (CloudFront)",
    }).addAlarmAction(snsAction);

    new cloudwatch.Alarm(this, "High5xx", {
      metric: metric5xx,
      threshold: 1,
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: "5xx error rate >= 1% (CloudFront)",
    }).addAlarmAction(snsAction);

    // ---- cdk-nag suppress: CFR1 & CFR2 ----
    NagSuppressions.addResourceSuppressions(this.distribution, [
      { id: "AwsSolutions-CFR1", reason: "Geo restriction not required; global access is intended." },
      { id: "AwsSolutions-CFR2", reason: "WAFv2 WebACL associated via L1 WebACLId override." },
    ]);

    // ---------------- Outputs ----------------
    new cdk.CfnOutput(this, "SiteUrl", { value: `https://${appDomain}` });
    new cdk.CfnOutput(this, "CfDomainFallback", {
      value: `https://${this.distribution.distributionDomainName}`,
    });
    new cdk.CfnOutput(this, "LogsBucketName", { value: cfLogsBucket.bucketName });
    new cdk.CfnOutput(this, "SiteBucketName", { value: this.bucket.bucketName });
    new cdk.CfnOutput(this, "WebAclArn", { value: waf.attrArn });

    // Keep legacy export name so importing stacks continue to work
    new cdk.CfnOutput(this, "CompatOldDistDomainExport", {
      value: this.distribution.distributionDomainName,
      exportName: "LalaWebStack:ExportsOutputFnGetAttDistribution830FAC52DomainNameBEB09E30",
    });
  }
}
