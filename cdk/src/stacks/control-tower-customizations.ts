import path from 'path';
import { Arn, Duration, NestedStack, NestedStackProps, Stack } from 'aws-cdk-lib';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { CfnFunction, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { LambdaSubscription } from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';
import { InstallControltowerCustomizations } from '../constructs/install-controltower-customizations';

const CONTROLTOWER_CUSTOMIZATIONS_REPO_NAME = 'custom-control-tower-configuration';
const CONTROLTOWER_CUSTOMIZATIONS_DONE_SSM_PARAMETER = '/superwerker/initial-ct-customizations-done';

export class ControlTowerCustomizationsStack extends NestedStack {
  constructor(scope: Construct, id: string, props: NestedStackProps) {
    super(scope, id, props);

    const notificationsTopic = new Topic(this, 'NotifyControlTowerCustomizationsStackUpdates');

    new InstallControltowerCustomizations(this, 'InstallControltowerCustomizations', {
      notificationsTopic: notificationsTopic.topicArn,
      ssmParameterName: CONTROLTOWER_CUSTOMIZATIONS_DONE_SSM_PARAMETER,
    });

    const configDirPath = path.join(__dirname, '..', 'functions', 'configure_controltower_customizations', 'config');

    const configureControlTowerCustomizations = new NodejsFunction(this, 'ConfigureControlTowerCustomizationsFunction', {
      entry: path.join(__dirname, '..', 'functions', 'configure_controltower_customizations', 'configure-controltower-customizations.ts'),
      runtime: Runtime.NODEJS_16_X,
      timeout: Duration.minutes(15),
      environment: {
        CONTROLTOWER_CUSTOMIZATIONS_DONE_SSM_PARAMETER: CONTROLTOWER_CUSTOMIZATIONS_DONE_SSM_PARAMETER,
      },
      bundling: {
        commandHooks: {
          afterBundling: (_inputDir: string, outputDir: string): string[] => [`cp -r ${configDirPath} ${outputDir}`],
          beforeBundling: (_inputDir: string, _outputDir: string): string[] => [],
          beforeInstall: (_inputDir: string, _outputDir: string): string[] => [],
        },
      },
    });
    (configureControlTowerCustomizations.node.defaultChild as CfnFunction).overrideLogicalId('ConfigureControlTowerCustomizationsFunction');

    notificationsTopic.addSubscription(new LambdaSubscription(configureControlTowerCustomizations));

    // TODO minimize permissions
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
  }
}
