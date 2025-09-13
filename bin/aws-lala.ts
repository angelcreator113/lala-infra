import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { WebStack } from "../lib/web-stack";
import { IdentityStack } from "../lib/identity-stack";
import { ApiStack } from "../lib/api-stack";
import { UploadsStack } from "../lib/uploads-stack";

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || "us-east-1",
};

// 1) Web (for Site URL)
const web = new WebStack(app, "LalaWebStack", { env });

// 2) Cognito using the CloudFront URL as callback (both forms)
const base = `https://${web.distribution.distributionDomainName}`;
const siteNoSlash = base;
const siteSlash = base.endsWith("/") ? base : `${base}/`;

const id = new IdentityStack(app, "LalaIdentityStack", {
  env,
  callbackUrls: [siteNoSlash, siteSlash, "http://localhost:5173", "http://localhost:3000"],
  logoutUrls:   [siteNoSlash, siteSlash, "http://localhost:5173", "http://localhost:3000"],
});

// 3) AppSync (Cognito auth)
new ApiStack(app, "LalaApiStack", { env, userPool: id.userPool });

// 4) Uploads API + S3 (Cognito-protected)
new UploadsStack(app, "LalaUploadsStack", { env, userPool: id.userPool });
