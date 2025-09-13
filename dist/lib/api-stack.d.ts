import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as appsync from "aws-cdk-lib/aws-appsync";
import * as cognito from "aws-cdk-lib/aws-cognito";
export interface ApiStackProps extends cdk.StackProps {
    userPool: cognito.IUserPool;
}
export declare class ApiStack extends cdk.Stack {
    readonly api: appsync.GraphqlApi;
    constructor(scope: Construct, id: string, props: ApiStackProps);
}
