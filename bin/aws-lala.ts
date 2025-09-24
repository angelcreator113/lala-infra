// bin/aws-lala.ts
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { AwsSolutionsChecks, NagSuppressions } from "cdk-nag";

import { WebStack } from "../lib/web-stack";
import { IdentityStack } from "../lib/identity-stack";
import { ApiStack } from "../lib/api-stack";
import { UploadsStack } from "../lib/uploads-stack";
import { CiRoleStack } from "../lib/ci-role-stack";

const app = new cdk.App();
cdk.Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || "us-east-1",
};

// ---------- shared config ----------
const rootDomain = app.node.tryGetContext("rootDomain") || "stylingadventures.com";
const appSubdomain = app.node.tryGetContext("appSubdomain") || "app";
const appOrigin = `https://${appSubdomain}.${rootDomain}`;

// Optional CF fallback hostname via context, e.g. -c cfFallback=dw4nr16mwqdqk.cloudfront.net
const cfFallbackHost: string | undefined = app.node.tryGetContext("cfFallback");
const cfFallbackOrigin = cfFallbackHost ? `https://${cfFallbackHost}` : undefined;

// ---------- 1) Web ----------
const web = new WebStack(app, "LalaWebStack", {
  env,
  rootDomainName: rootDomain,
  appSubdomain,
});

// ---------- 2) Identity (Cognito) ----------
const callbackAndLogout = [
  appOrigin,
  `${appOrigin}/`,
  ...(cfFallbackOrigin ? [cfFallbackOrigin, `${cfFallbackOrigin}/`] : []),
  "http://localhost:5173",
  "http://localhost:3000",
];

const id = new IdentityStack(app, "LalaIdentityStack", {
  env,
  callbackUrls: callbackAndLogout,
  logoutUrls: callbackAndLogout,
});

// Suppress Cognito COG2 if you keep MFA optional (documented rationale)
// Suppress COG3 because Essentials tier requires AdvancedSecurityMode=OFF (no Threat Protection)
NagSuppressions.addStackSuppressions(
  id,
  [
    {
      id: "AwsSolutions-COG2",
      reason:
        "MFA is OPTIONAL (OTP only) for dev convenience; will be enforced later.",
    },
    {
      id: "AwsSolutions-COG3",
      reason:
        "Cognito Essentials tier: Threat Protection not available. AdvancedSecurityMode set to OFF by design.",
    },
  ],
  true
);

// ---------- 3) API (AppSync) ----------
const api = new ApiStack(app, "LalaApiStack", { env, userPool: id.userPool });

// ---------- 4) Uploads (S3 signed URLs) ----------
const uploads = new UploadsStack(app, "LalaUploadsStack", {
  env,
  userPool: id.userPool,
  allowedOrigins: [
    appOrigin,
    ...(cfFallbackOrigin ? [cfFallbackOrigin] : []),
    "http://localhost:5173",
    "http://localhost:3000",
  ],
});

// ---------- 5) CI Role ----------
const ci = new CiRoleStack(app, "LalaCiRoleStack", {
  env,
  githubRepo: app.node.tryGetContext("githubRepo") || "YOUR_ORG/YOUR_REPO",
  githubRef: app.node.tryGetContext("githubRef") || "refs/heads/main",
  roleName: app.node.tryGetContext("ciRoleName") || "GitHubOIDC-CDK-Deploy",
});

/** ========= cdk-nag stack-level suppressions ========= */

// API: managed/wildcard from CDK custom resources
NagSuppressions.addStackSuppressions(
  api,
  [
    {
      id: "AwsSolutions-IAM4",
      reason:
        "CDK log-retention and helper custom resources may attach AWS managed policies; app roles are explicit.",
    },
    {
      id: "AwsSolutions-IAM5",
      reason:
        "Generated log-retention resources may require wildcard on CloudWatch Logs. Application roles are scoped.",
    },
    { id: "AwsSolutions-L1", reason: "Custom resource runtimes are controlled by the provider." },
  ],
  true
);

// Uploads: initial posture; refine in follow-ups
NagSuppressions.addStackSuppressions(
  uploads,
  [
    {
      id: "AwsSolutions-IAM4",
      reason: "Initial roles created by constructs (API Gateway/Lambda); will be tightened later.",
    },
    {
      id: "AwsSolutions-IAM5",
      reason: "Signed URL Lambdas and integrations need broad S3/Logs during initial setup.",
    },
    { id: "AwsSolutions-APIG1", reason: "Access logging will be enabled in a subsequent change." },
    { id: "AwsSolutions-APIG2", reason: "Basic request validation will be added later." },
    { id: "AwsSolutions-APIG6", reason: "Stage-level method logging to be enabled later." },
    { id: "AwsSolutions-APIG4", reason: "CORS preflight (OPTIONS) must be unauthenticated by design." },
    { id: "AwsSolutions-COG4", reason: "CORS preflight (OPTIONS) must be unauthenticated by design." },
    { id: "AwsSolutions-L1", reason: "Provider controls runtime for custom resources." },
  ],
  true
);

// CI role: admin for CDK bootstrap/deploy (documented)
NagSuppressions.addStackSuppressions(
  ci,
  [
    {
      id: "AwsSolutions-IAM4",
      reason:
        "AdministratorAccess is used for CDK boot/deploy role in this account; will add a permissions boundary later.",
    },
  ],
  true
);
