// lib/identity-stack.ts
import * as cdk from "aws-cdk-lib";
import { Stack, StackProps, Duration, CfnOutput } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as cognito from "aws-cdk-lib/aws-cognito";

export interface IdentityStackProps extends StackProps {
  callbackUrls: string[];
  logoutUrls: string[];
  /** Optional: explicit hosted UI domain prefix (must be unique per region). */
  cognitoDomainPrefix?: string;
  /** Optional: create Cognito-managed hosted UI domain (default: false). */
  createHostedDomain?: boolean;
}

export class IdentityStack extends Stack {
  public readonly userPool: cognito.UserPool;

  constructor(scope: Construct, id: string, props: IdentityStackProps) {
    super(scope, id, props);

    // ---------- User Pool ----------
    this.userPool = new cognito.UserPool(this, "UserPool", {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      // Email-only verification to avoid SNS/SMS dependencies
      userVerification: {
        emailSubject: "Verify your email for Lala",
        emailBody: "Hello {username}, your verification code is {####}",
        emailStyle: cognito.VerificationEmailStyle.CODE,
      },
      // OTP-only MFA (no SMS role)
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: { otp: true, sms: false },
      passwordPolicy: {
        minLength: 12,
        requireDigits: true,
        requireLowercase: true,
        requireUppercase: true,
        requireSymbols: true,
        tempPasswordValidity: Duration.days(7),
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
    });

    // ---------- Hosted UI domain (Cognito-managed subdomain) [opt-in] ----------
    // Avoid CFN rollbacks when a pool already has a domain or a prefix collides.
    const hostedDomainCtx = this.node.tryGetContext("createHostedDomain") as unknown;
    const createHostedDomain =
      typeof hostedDomainCtx === "string"
        ? hostedDomainCtx.toLowerCase() === "true"
        : (hostedDomainCtx as boolean | undefined) ?? props.createHostedDomain ?? false;

    let domain: cognito.UserPoolDomain | undefined;
    if (createHostedDomain) {
      // Use context override if provided; otherwise default to lala-<account>-<region>
      const domainPrefixRaw =
        (this.node.tryGetContext("cognitoDomainPrefix") as string | undefined) ??
        props.cognitoDomainPrefix ??
        `lala-${this.account}-${cdk.Stack.of(this).region}`;
      const domainPrefix = sanitizePrefix(domainPrefixRaw);

      domain = this.userPool.addDomain("Domain", {
        cognitoDomain: { domainPrefix },
      });
    }

    // ---------- App client (OAuth) ----------
    const client = this.userPool.addClient("AppClient", {
      generateSecret: false,
      preventUserExistenceErrors: true,
      authFlows: { userSrp: true },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.PROFILE,
          cognito.OAuthScope.EMAIL,
        ],
        callbackUrls: props.callbackUrls,
        logoutUrls: props.logoutUrls,
      },
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(30),
    });

    // ---------- Outputs ----------
    new CfnOutput(this, "UserPoolId", { value: this.userPool.userPoolId });
    new CfnOutput(this, "UserPoolClientId", { value: client.userPoolClientId });
    if (domain) new CfnOutput(this, "UserPoolDomain", { value: domain.domainName });
  }
}

/** Sanitize domain prefix: 3–63 chars, lowercase letters/numbers/hyphens; no leading/trailing hyphen. */
function sanitizePrefix(input: string): string {
  let v = (input ?? "").toLowerCase().replace(/[^a-z0-9-]/g, "-");
  v = v.replace(/^-+/, "").replace(/-+$/, "");
  if (!v) v = "lala";
  if (v.length < 3) v = `lala-${v}`;
  if (v.length > 63) v = v.slice(0, 63).replace(/-+$/, "");
  return v;
}
