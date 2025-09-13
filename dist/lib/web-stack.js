"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebStack = void 0;
const fs = __importStar(require("fs"));
const cdk = __importStar(require("aws-cdk-lib"));
const s3 = __importStar(require("aws-cdk-lib/aws-s3"));
const cloudfront = __importStar(require("aws-cdk-lib/aws-cloudfront"));
const origins = __importStar(require("aws-cdk-lib/aws-cloudfront-origins"));
const s3deploy = __importStar(require("aws-cdk-lib/aws-s3-deployment"));
const route53 = __importStar(require("aws-cdk-lib/aws-route53"));
const acm = __importStar(require("aws-cdk-lib/aws-certificatemanager"));
const targets = __importStar(require("aws-cdk-lib/aws-route53-targets"));
class WebStack extends cdk.Stack {
    constructor(scope, id, props) {
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
            target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(this.distribution)),
        });
        new route53.AaaaRecord(this, "AppAliasAAAA", {
            zone,
            recordName: appDomain,
            target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(this.distribution)),
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
            // Use Source.data so the file is guaranteed to be uploaded
            sources: [s3deploy.Source.data("index.html", fs.readFileSync("site/index.html", "utf8"))],
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
exports.WebStack = WebStack;
