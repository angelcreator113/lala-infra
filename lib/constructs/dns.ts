import { Construct } from "constructs";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";

export interface DnsProps {
  zone: route53.IHostedZone;
  appDomain: string;
  distribution: cloudfront.IDistribution;
}

export class DnsRecords extends Construct {
  constructor(scope: Construct, id: string, props: DnsProps) {
    super(scope, id);
    new route53.ARecord(this, "A", {
      zone: props.zone, recordName: props.appDomain,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(props.distribution)),
    });
    new route53.AaaaRecord(this, "AAAA", {
      zone: props.zone, recordName: props.appDomain,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(props.distribution)),
    });
  }
}
