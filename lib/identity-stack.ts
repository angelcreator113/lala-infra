import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as cognito from "aws-cdk-lib/aws-cognito";

export interface IdentityStackProps extends cdk.StackProps {
  callbackUrls: string[];
  logoutUrls?: string[];
}

export class IdentityStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly identityPool: cognito.CfnIdentityPool;

  constructor(scope: Construct, id: string, props: IdentityStackProps) {
    super(scope, id, props);

    this.userPool = new cognito.UserPool(this, "UserPool", {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      passwordPolicy: { minLength: 8, requireLowercase: true, requireDigits: true },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const domainPrefix = `lala-${cdk.Stack.of(this).account?.slice(-4) ?? "demo"}-${this.node.addr.slice(0,4)}`.toLowerCase();
    const domain = this.userPool.addDomain("HostedUiDomain", {
      cognitoDomain: { domainPrefix }
    });

    this.userPoolClient = new cognito.UserPoolClient(this, "UserPoolClient", {
      userPool: this.userPool,
      authFlows: { userPassword: true, userSrp: true, custom: true },
      generateSecret: false,
      oAuth: {
        flows: { authorizationCodeGrant: true },
        callbackUrls: props.callbackUrls,
        logoutUrls: props.logoutUrls ?? props.callbackUrls,
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE]
      }
    });

    this.identityPool = new cognito.CfnIdentityPool(this, "IdentityPool", {
      allowUnauthenticatedIdentities: false,
      cognitoIdentityProviders: [{
        clientId: this.userPoolClient.userPoolClientId,
        providerName: this.userPool.userPoolProviderName
      }]
    });

    const region = cdk.Stack.of(this).region;
    const hostedDomain = `${domainPrefix}.auth.${region}.amazoncognito.com`;

    new cdk.CfnOutput(this, "UserPoolId", { value: this.userPool.userPoolId });
    new cdk.CfnOutput(this, "UserPoolClientId", { value: this.userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, "CognitoDomain", { value: hostedDomain });
    // Convenience login URL pointing back to the FIRST callback URL
    new cdk.CfnOutput(this, "CognitoHostedUiSite", {
      value: `https://${hostedDomain}/login?client_id=${this.userPoolClient.userPoolClientId}&response_type=code&scope=email+openid+profile&redirect_uri=${encodeURIComponent(props.callbackUrls[0])}`
    });
  }
}
