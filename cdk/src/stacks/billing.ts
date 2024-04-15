import { CfnOutput, NestedStack, NestedStackProps, aws_iam as iam } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { BillingSetup } from '../constructs/billing-setup';

export class BillingStack extends NestedStack {
  constructor(scope: Construct, id: string, props: NestedStackProps) {
    super(scope, id, props);

    const billingSetupConst = new BillingSetup(this, 'BillingSetup');

    const awsApiLibBillingRole = new iam.Role(this, 'AwsApilibRole', {
      assumedBy: billingSetupConst.billingSetupFn.role!,
      inlinePolicies: {
        AWSApiLibBillingPolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['billing:*', 'tax:*', 'invoicing:*'],
              resources: ['*'],
            }),
          ],
        }),
      },
    });
    (awsApiLibBillingRole.node.defaultChild as iam.CfnRole).overrideLogicalId('BillingApilibRole');

    billingSetupConst.billingSetupFn.addEnvironment('AWSAPILIB_BILLING_ROLE_ARN', awsApiLibBillingRole.roleArn);

    new CfnOutput(this, 'BillingSetupFunctionName', {
      description: 'Function Name for Billing Setup Lambda',
      value: billingSetupConst.billingSetupFn.functionName,
    });
    new CfnOutput(this, 'AwsApiLibRoleName', {
      description: 'Role Name for AWS API Lib',
      value: awsApiLibBillingRole.roleName,
    });
  }
}
