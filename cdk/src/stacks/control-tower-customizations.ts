import { Arn, NestedStack, NestedStackProps, Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { InstallControltowerCustomizations } from '../constructs/install-controltower-customizations';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import path from 'path';
import { CfnFunction, Runtime } from 'aws-cdk-lib/aws-lambda';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { LambdaSubscription } from 'aws-cdk-lib/aws-sns-subscriptions';

export class ControlTowerCustomizationsStack extends NestedStack {
  constructor(scope: Construct, id: string, props: NestedStackProps) {
    super(scope, id, props);

    const notificationsTopic = new Topic(this, 'NotifyControlTowerCustomizationsStackUpdates');

    const configureControlTowerCustomizations = new NodejsFunction(this, 'ConfigureControlTowerCustomizationsFunction', {
      entry: path.join(__dirname, '..', 'functions', 'configure-controltower-customizations.ts'),
      runtime: Runtime.NODEJS_16_X,
    });
    notificationsTopic.addSubscription(new LambdaSubscription(configureControlTowerCustomizations));

    (configureControlTowerCustomizations.node.defaultChild as CfnFunction).overrideLogicalId('ConfigureControlTowerCustomizationsFunction');
    configureControlTowerCustomizations.addToRolePolicy(
      new PolicyStatement({
        actions: ['ssm:PutParameter'],
        resources: [
          Arn.format(
            {
              service: 'ssm',
              resource: 'parameter',
              resourceName: 'superwerker*',
            },
            Stack.of(this),
          ),
        ],
      }),
    );

    new InstallControltowerCustomizations(this, 'InstallControltowerCustomizations', {
      notificationsTopic: notificationsTopic.topicArn,
    });
  }
}
