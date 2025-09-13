import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as cognito from "aws-cdk-lib/aws-cognito";
export interface IdentityStackProps extends cdk.StackProps {
    callbackUrls: string[];
    logoutUrls?: string[];
}
export declare class IdentityStack extends cdk.Stack {
    readonly userPool: cognito.UserPool;
    readonly userPoolClient: cognito.UserPoolClient;
    readonly identityPool: cognito.CfnIdentityPool;
    constructor(scope: Construct, id: string, props: IdentityStackProps);
}
