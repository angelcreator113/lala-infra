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
exports.IdentityStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const cognito = __importStar(require("aws-cdk-lib/aws-cognito"));
class IdentityStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        this.userPool = new cognito.UserPool(this, "UserPool", {
            selfSignUpEnabled: true,
            signInAliases: { email: true },
            passwordPolicy: { minLength: 8, requireLowercase: true, requireDigits: true },
            accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
            removalPolicy: cdk.RemovalPolicy.DESTROY
        });
        const domainPrefix = `lala-${cdk.Stack.of(this).account?.slice(-4) ?? "demo"}-${this.node.addr.slice(0, 4)}`.toLowerCase();
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
exports.IdentityStack = IdentityStack;
