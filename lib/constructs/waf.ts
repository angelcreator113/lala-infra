import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import * as wafv2 from "aws-cdk-lib/aws-wafv2";

export interface WafProps {
  name: string;
  rateLimitPer5m?: number;  // 0 to disable
  blockManaged?: boolean;
}

export class WebAcl extends Construct {
  readonly arn: string;

  constructor(scope: Construct, id: string, props: WafProps) {
    super(scope, id);

    const rate = props.rateLimitPer5m ?? 2000;
    const block = !!props.blockManaged;

    const acl = new wafv2.CfnWebACL(this, "Acl", {
      defaultAction: { allow: {} },
      scope: "CLOUDFRONT",
      name: props.name,
      visibilityConfig: { cloudWatchMetricsEnabled: true, metricName: "app-waf", sampledRequestsEnabled: true },
      rules: [
        ...["AWSManagedRulesCommonRuleSet","AWSManagedRulesKnownBadInputsRuleSet","AWSManagedRulesSQLiRuleSet","AWSManagedRulesAmazonIpReputationList"]
          .map((name, i) => ({
            name, priority: 10 + i,
            statement: { managedRuleGroupStatement: { vendorName: "AWS", name } },
            overrideAction: block ? { none: {} } : { count: {} },
            visibilityConfig: { cloudWatchMetricsEnabled: true, metricName: `waf-${name}`, sampledRequestsEnabled: true },
          }) as wafv2.CfnWebACL.RuleProperty),
        ...(rate > 0 ? [{
          name: "RateLimitPerIp", priority: 50,
          statement: { rateBasedStatement: { aggregateKeyType: "IP", limit: rate } },
          action: block ? { block: {} } : { count: {} },
          visibilityConfig: { cloudWatchMetricsEnabled: true, metricName: "waf-rate-limit", sampledRequestsEnabled: true },
        } as wafv2.CfnWebACL.RuleProperty] : []),
      ],
    });

    this.arn = acl.attrArn;
  }
}
