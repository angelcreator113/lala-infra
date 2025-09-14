import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { WebStack } from "../lib/web-stack";
import { IdentityStack } from "../lib/identity-stack";
import { ApiStack } from "../lib/api-stack";
import { UploadsStack } from "../lib/uploads-stack";
import { CiRoleStack } from "../lib/ci-role-stack"; // <-- added

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || "us-east-1",
};

// 1) Web (custom domain served by CloudFront)
const web = new WebStack(app, "LalaWebStack", {
  env,
  rootDomainName: "stylingadventures.com",
  appSubdomain: "app",
});

// Branded & fallback origins
const appOrigin = "https://app.stylingadventures.com";
const cfOrigin  = `https://${web.distribution.distributionDomainName}`;
const callbackAndLogout = [
  appOrigin, `${appOrigin}/`,
  cfOrigin,  `${cfOrigin}/`,
  "http://localhost:5173",
  "http://localhost:3000",
];

// 2) Cognito Hosted UI (both forms of CF URL + local dev)
const id = new IdentityStack(app, "LalaIdentityStack", {
  env,
  callbackUrls: callbackAndLogout,
  logoutUrls:   callbackAndLogout,
});

// 3) AppSync (Cognito auth)
new ApiStack(app, "LalaApiStack", { env, userPool: id.userPool });

// 4) Uploads (S3 + rules)
new UploadsStack(app, "LalaUploadsStack", {
  env,
  userPool: id.userPool,
  // Allow branded domain, CF fallback, and local dev (both ports)
  allowedOrigins: [appOrigin, cfOrigin, "http://localhost:5173", "http://localhost:3000"],
});

// 5) CI Role for GitHub OIDC → CDK deploys
new CiRoleStack(app, "LalaCiRoleStack", {
  env,
  githubRepo: "YOUR_ORG/YOUR_REPO",   // <-- update this!
  githubRef: "refs/heads/main",
  roleName: "GitHubOIDC-CDK-Deploy",
});
