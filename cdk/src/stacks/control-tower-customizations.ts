import path from 'path';
import { Arn, Duration, NestedStack, NestedStackProps, Stack } from 'aws-cdk-lib';
import { Rule } from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { CfnFunction, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import { InstallControltowerCustomizations } from '../constructs/install-controltower-customizations';

const CONTROLTOWER_CUSTOMIZATIONS_VERSION = '2.7.0';
const CONTROLTOWER_CUSTOMIZATIONS_REPO_NAME = 'custom-control-tower-configuration';

export class ControlTowerCustomizationsStack extends NestedStack {
  constructor(scope: Construct, id: string, props: NestedStackProps) {
    super(scope, id, props);

    const configDirPath = path.join(__dirname, '..', 'functions', 'configure_controltower_customizations', 'config');

    const configureControlTowerCustomizations = new NodejsFunction(this, 'ConfigureControlTowerCustomizationsFunction', {
      entry: path.join(__dirname, '..', 'functions', 'configure_controltower_customizations', 'configure-controltower-customizations.ts'),
      runtime: Runtime.NODEJS_18_X,
      timeout: Duration.minutes(5),
      bundling: {
        commandHooks: {
          afterBundling: (_inputDir: string, outputDir: string): string[] => [`cp -r ${configDirPath} ${outputDir}`],
          beforeBundling: (_inputDir: string, _outputDir: string): string[] => [],
          beforeInstall: (_inputDir: string, _outputDir: string): string[] => [],
        },
      },
    });
    (configureControlTowerCustomizations.node.defaultChild as CfnFunction).overrideLogicalId('ConfigureControlTowerCustomizationsFunction');

    const rule = new Rule(this, 'codeCommitRule', {
      eventPattern: {
        source: ['aws.codecommit'],
        detailType: ['AWS API Call via CloudTrail'],
        detail: {
          eventSource: ['codecommit.amazonaws.com'],
          eventName: ['CreateRepository'],
          requestParameters: {
            repositoryName: [CONTROLTOWER_CUSTOMIZATIONS_REPO_NAME],
          },
        },
      },
    });

    rule.addTarget(new LambdaFunction(configureControlTowerCustomizations));
    targets.addLambdaPermission(rule, configureControlTowerCustomizations);

    configureControlTowerCustomizations.addToRolePolicy(
      new PolicyStatement({
        actions: ['codecommit:createCommit', 'codecommit:getBranch', 'codecommit:getRepository'],
        resources: [
          Arn.format(
            {
              service: 'codecommit',
              resource: CONTROLTOWER_CUSTOMIZATIONS_REPO_NAME,
            },
            Stack.of(this),
          ),
        ],
      }),
    );

    const installControltowerCustomizations = new InstallControltowerCustomizations(this, 'InstallControltowerCustomizations', {
      controlTowerCustomizationsVersion: CONTROLTOWER_CUSTOMIZATIONS_VERSION,
    });
    // this is needed to avoid the codeCommit repo being created before the lambda can be triggerd to do the initial commit
    installControltowerCustomizations.node.addDependency(rule);
  }
}
