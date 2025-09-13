import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as cognito from "aws-cdk-lib/aws-cognito";
export interface UploadsStackProps extends cdk.StackProps {
    userPool: cognito.IUserPool;
}
export declare class UploadsStack extends cdk.Stack {
    readonly bucket: s3.Bucket;
    readonly api: apigateway.RestApi;
    constructor(scope: Construct, id: string, props: UploadsStackProps);
}
