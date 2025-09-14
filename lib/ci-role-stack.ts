import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as iam from "aws-cdk-lib/aws-iam";

export interface CiRoleStackProps extends cdk.StackProps {
  /** e.g. "YourOrg/your-repo" */
  githubRepo: string;
  /** optional: restrict to a branch ref, e.g. "refs/heads/main" */
  githubRef?: string;
  /** name for the role */
  roleName?: string;
}

export class CiRoleStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CiRoleStackProps) {
    super(scope, id, props);

    const role = new iam.Role(this, "GithubOidcCdkDeployRole", {
      roleName: props.roleName ?? "GitHubOIDC-CDK-Deploy",
      assumedBy: new iam.WebIdentityPrincipal(
        "arn:aws:iam::" + cdk.Aws.ACCOUNT_ID + ":oidc-provider/token.actions.githubusercontent.com",
        {
          StringEquals: {
            "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          },
          StringLike: {
            "token.actions.githubusercontent.com:sub": `repo:${props.githubRepo}:${props.githubRef ?? "*"}`,
          },
        }
      ),
      // simplest path: full admin so CDK can create/update anything it needs
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AdministratorAccess"),
      ],
      description: "Allows GitHub Actions (OIDC) to deploy CDK stacks",
    });

    new cdk.CfnOutput(this, "CiRoleArn", { value: role.roleArn });
  }
}
