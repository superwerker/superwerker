import path from 'path';
import { PythonFunction } from '@aws-cdk/aws-lambda-python-alpha';
import { Duration, NestedStack, NestedStackProps, aws_events as events, aws_iam as iam, aws_lambda as lambda } from 'aws-cdk-lib';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { Construct } from 'constructs';

export class BillingStack extends NestedStack {
  constructor(scope: Construct, id: string, props: NestedStackProps) {
    super(scope, id, props);

    const billingSetupFn = new PythonFunction(this, 'NotificationOpsItemCreated', {
      entry: path.join(__dirname, '..', 'functions', 'notification-opsitem-created.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.PYTHON_3_12,
      timeout: Duration.seconds(30),
    });
    (billingSetupFn.node.defaultChild as lambda.CfnFunction).overrideLogicalId('BillingSetup');

    const awsApiLibBillingRole = new iam.Role(this, 'AwsApilibRole', {
      assumedBy: billingSetupFn.role!,
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess')],
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
  }
}
