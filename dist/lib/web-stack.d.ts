import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
export interface WebStackProps extends cdk.StackProps {
    siteBucketName?: string;
    /**
     * Root hosted zone (e.g., "stylingadventures.com").
     * Defaults to "stylingadventures.com".
     */
    rootDomainName?: string;
    /**
     * Subdomain to host the app (e.g., "app" -> "app.stylingadventures.com").
     * Defaults to "app".
     */
    appSubdomain?: string;
}
export declare class WebStack extends cdk.Stack {
    readonly bucket: s3.Bucket;
    readonly distribution: cloudfront.Distribution;
    constructor(scope: Construct, id: string, props?: WebStackProps);
}
