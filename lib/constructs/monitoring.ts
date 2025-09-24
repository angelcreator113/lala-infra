import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cw_actions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import * as kms from "aws-cdk-lib/aws-kms";
import * as iam from "aws-cdk-lib/aws-iam";

export interface MonitoringProps {
  distribution: cloudfront.Distribution;
  notifyEmails: string[];
}

export class Monitoring extends Construct {
  readonly topic: sns.Topic;

  constructor(scope: Construct, id: string, props: MonitoringProps) {
    super(scope, id);

    const key = new kms.Key(this, "AlertsKey", { enableKeyRotation: true });
    this.topic = new sns.Topic(this, "AlertsTopic", { displayName: "Lala CloudFront Alerts", masterKey: key });
    this.topic.addToResourcePolicy(new iam.PolicyStatement({
      sid: "HttpsOnlyPublish", effect: iam.Effect.DENY, principals: [new iam.AnyPrincipal()],
      actions: ["sns:Publish"], resources: [this.topic.topicArn],
      conditions: { Bool: { "aws:SecureTransport": "false" } },
    }));
    props.notifyEmails.forEach(e => this.topic.addSubscription(new subs.EmailSubscription(e)));

    const distId = props.distribution.distributionId;
    const dims = { DistributionId: distId, Region: "Global" };
    const snsAction = new cw_actions.SnsAction(this.topic);

    new cloudwatch.Alarm(this, "High4xx", {
      metric: new cloudwatch.Metric({ namespace: "AWS/CloudFront", metricName: "4xxErrorRate", statistic: "Average", period: cdk.Duration.minutes(5), dimensionsMap: dims }),
      threshold: 5, evaluationPeriods: 3, comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING, alarmDescription: "4xx error rate >= 5% (CloudFront)",
    }).addAlarmAction(snsAction);

    new cloudwatch.Alarm(this, "High5xx", {
      metric: new cloudwatch.Metric({ namespace: "AWS/CloudFront", metricName: "5xxErrorRate", statistic: "Average", period: cdk.Duration.minutes(5), dimensionsMap: dims }),
      threshold: 1, evaluationPeriods: 3, comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING, alarmDescription: "5xx error rate >= 1% (CloudFront)",
    }).addAlarmAction(snsAction);
  }
}
