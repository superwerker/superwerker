import { Arn, Duration, NestedStack, NestedStackProps, Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { InstallControltowerCustomizations } from '../constructs/install-controltower-customizations';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import path from 'path';
import { CfnFunction, Runtime } from 'aws-cdk-lib/aws-lambda';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { LambdaSubscription } from 'aws-cdk-lib/aws-sns-subscriptions';

const CONTROLTOWER_CUSTOMIZATIONS_REPO_NAME = 'custom-control-tower-configuration';

export class ControlTowerCustomizationsStack extends NestedStack {
  constructor(scope: Construct, id: string, props: NestedStackProps) {
    super(scope, id, props);

    const notificationsTopic = new Topic(this, 'NotifyControlTowerCustomizationsStackUpdates');

    const configDirPath = path.join(__dirname, '..', 'functions', 'configure_controltower_customizations', 'config');

    const configureControlTowerCustomizations = new NodejsFunction(this, 'ConfigureControlTowerCustomizationsFunction', {
      entry: path.join(__dirname, '..', 'functions', 'configure_controltower_customizations', 'configure-controltower-customizations.ts'),
      runtime: Runtime.NODEJS_16_X,
      timeout: Duration.minutes(15),
      bundling: {
        commandHooks: {
          afterBundling: (inputDir: string, outputDir: string): string[] => [`cp -r ${configDirPath} ${outputDir}`],
          beforeBundling: (inputDir: string, outputDir: string): string[] => [],
          beforeInstall: (inputDir: string, outputDir: string): string[] => [],
        },
      },
    });
    notificationsTopic.addSubscription(new LambdaSubscription(configureControlTowerCustomizations));

    (configureControlTowerCustomizations.node.defaultChild as CfnFunction).overrideLogicalId('ConfigureControlTowerCustomizationsFunction');
    configureControlTowerCustomizations.addToRolePolicy(
      new PolicyStatement({
        actions: ['ssm:PutParameter', 'ssm:GetParameter'],
        resources: ['*'],
      }),
    );
    configureControlTowerCustomizations.addToRolePolicy(
      new PolicyStatement({
        actions: ['ssm:PutParameter', 'ssm:GetParameter'],
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
    configureControlTowerCustomizations.addToRolePolicy(
      new PolicyStatement({
        actions: ['codecommit:createCommit', 'codecommit:getBranch', 'codecommit:getRepository'],
        resources: ['*'],
      }),
    );
    configureControlTowerCustomizations.addToRolePolicy(
      new PolicyStatement({
        actions: ['codecommit:createCommit'],
        resources: [
          Arn.format(
            {
              service: 'codecommit',
              resource: 'repository',
              resourceName: CONTROLTOWER_CUSTOMIZATIONS_REPO_NAME,
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
