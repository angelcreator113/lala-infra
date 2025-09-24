// lib/constructs/cf-site.ts
import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import { NagSuppressions } from "cdk-nag";

export interface CfSiteProps {
  bucket: s3.IBucket;
  domainName?: string;           // e.g., app.example.com
  certificate?: acm.ICertificate; // ACM cert for domain (optional in phase 1)
  logsBucket?: s3.IBucket;
  webAclArn?: string;
  originAccessControlId: string; // provided by the stack (we don't create OAC here)
}

export class CfSite extends Construct {
  readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: CfSiteProps) {
    super(scope, id);

    // Security headers (includes your CSP)
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "connect-src 'self' https://*.amazonaws.com https://*.cloudfront.net https://app.stylingadventures.com",
      "font-src 'self' data:",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "upgrade-insecure-requests",
    ].join("; ");

    const headers = new cloudfront.ResponseHeadersPolicy(this, "AppSecurityHeaders", {
      securityHeadersBehavior: {
        contentSecurityPolicy: { contentSecurityPolicy: csp, override: true },
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
        referrerPolicy: { referrerPolicy: cloudfront.HeadersReferrerPolicy.NO_REFERRER, override: true },
        strictTransportSecurity: {
          accessControlMaxAge: cdk.Duration.days(365),
          includeSubdomains: true,
          preload: true,
          override: true,
        },
        xssProtection: { protection: true, modeBlock: true, override: true },
      },
    });

    // Distribution (keep S3Origin for your current CDK version)
    this.distribution = new cloudfront.Distribution(this, "Distribution", {
      defaultRootObject: "index.html",
      domainNames: props.domainName ? [props.domainName] : undefined,
      certificate: props.certificate, // undefined in phase 1; set in phase 2
      enableLogging: !!props.logsBucket,
      logBucket: props.logsBucket,
      logFilePrefix: "cf/",
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      defaultBehavior: {
        origin: new origins.S3Origin(props.bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy: headers,
        compress: true,
      },
      // SPA fallback
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: "/index.html", ttl: cdk.Duration.seconds(1) },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: "/index.html", ttl: cdk.Duration.seconds(1) },
      ],
    });

    // L1 overrides: associate WAF + OAC
    const cfnDist = this.distribution.node.defaultChild as cloudfront.CfnDistribution;
    if (props.webAclArn) {
      cfnDist.addPropertyOverride("DistributionConfig.WebACLId", props.webAclArn);
    }
    cfnDist.addPropertyOverride("DistributionConfig.Origins.0.OriginAccessControlId", props.originAccessControlId);
    cfnDist.addPropertyOverride("DistributionConfig.Origins.0.S3OriginConfig.OriginAccessIdentity", "");

    // Phase 1 (no ACM cert, no alias): suppress CFR4 temporarily.
    if (!props.certificate) {
      NagSuppressions.addResourceSuppressions(this.distribution, [
        {
          id: "AwsSolutions-CFR4",
          reason:
            "Two-step rollout: phase 1 uses default CF cert while alias is unclaimed. Phase 2 attaches ACM cert enforcing TLS1.2.",
        },
      ]);
    }
  }
}
