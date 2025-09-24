import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";

export interface DeploymentsProps {
  bucket: s3.IBucket;
  distribution: cloudfront.IDistribution;
}

export class StaticDeployments extends Construct {
  constructor(scope: Construct, id: string, props: DeploymentsProps) {
    super(scope, id);

    const assets = new s3deploy.BucketDeployment(this, "Assets", {
      sources: [s3deploy.Source.asset("site", { exclude: ["index.html","robots.txt","sitemap.xml"] })],
      destinationBucket: props.bucket,
      distribution: props.distribution as cloudfront.Distribution,
      distributionPaths: ["/assets/*", "/favicon.ico"],
      cacheControl: [s3deploy.CacheControl.setPublic(), s3deploy.CacheControl.maxAge(cdk.Duration.days(365)), s3deploy.CacheControl.immutable()],
      prune: false,
    });

    const html = new s3deploy.BucketDeployment(this, "Html", {
      sources: [
        s3deploy.Source.asset("site", { exclude: ["assets/*","favicon.ico"] }),
      ],
      destinationBucket: props.bucket,
      distribution: props.distribution as cloudfront.Distribution,
      distributionPaths: ["/", "/index.html", "/robots.txt", "/sitemap.xml"],
      cacheControl: [s3deploy.CacheControl.setPublic(), s3deploy.CacheControl.maxAge(cdk.Duration.minutes(5)), s3deploy.CacheControl.mustRevalidate()],
      prune: false,
    });
    html.node.addDependency(assets);
  }
}
