import path from 'path';
import { PythonFunction } from '@aws-cdk/aws-lambda-python-alpha';
import {
  CfnOutput,
  Duration,
  NestedStack,
  NestedStackProps,
  aws_events as events,
  aws_iam as iam,
  aws_lambda as lambda,
} from 'aws-cdk-lib';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { Construct } from 'constructs';

export class BillingStack extends NestedStack {
  constructor(scope: Construct, id: string, props: NestedStackProps) {
    super(scope, id, props);

    const billingSetupFn = new PythonFunction(this, 'BillingSetup', {
      entry: path.join(__dirname, '..', 'functions', 'billing-setup'),
      handler: 'handler',
      runtime: lambda.Runtime.PYTHON_3_12,
      timeout: Duration.seconds(30),
    });
    (billingSetupFn.node.defaultChild as lambda.CfnFunction).overrideLogicalId('BillingSetup');

    const awsApiLibBillingRole = new iam.Role(this, 'AwsApilibRole', {
      assumedBy: billingSetupFn.role!,
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

    billingSetupFn.addEnvironment('AWSAPILIB_BILLING_ROLE_ARN', awsApiLibBillingRole.roleArn);

    const landingZoneSetupFinishedTrigger = new events.Rule(this, 'LandingZoneSetupFinishedTrigger', {
      eventPattern: {
        source: ['superwerker'],
        detail: {
          eventName: ['LandingZoneSetupOrUpdateFinished'],
        },
      },
    });

    landingZoneSetupFinishedTrigger.addTarget(new LambdaFunction(billingSetupFn));

    new CfnOutput(this, 'AwsApiLibRoleName', {
      description: 'Role Name for AWS API Lib',
      value: awsApiLibBillingRole.roleName,
    });
    new CfnOutput(this, 'BillingSetupFunctionName', {
      description: 'Function Name for Billing Setup Lambda',
      value: billingSetupFn.functionName,
    });
  }
}
