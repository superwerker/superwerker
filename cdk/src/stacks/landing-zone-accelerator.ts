import { Arn, CfnParameter, Duration, NestedStack, NestedStackProps, Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import path from 'path';
import { CfnFunction, Runtime } from 'aws-cdk-lib/aws-lambda';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { LambdaSubscription } from 'aws-cdk-lib/aws-sns-subscriptions';
import { InstallLandingZoneAccelerator } from '../constructs/install-landing-zone-accelerator';

const LZA_REPO_NAME = 'landing-zone-accelerator';
const LZA_VERSION = 'v1.5.2';

export class LandingZoneAcceleratorStack extends NestedStack {
  constructor(scope: Construct, id: string, props: NestedStackProps) {
    super(scope, id, props);

    const logArchiveAWSAccountEmail = new CfnParameter(this, 'LogArchiveAWSAccountEmail', {
      type: 'String',
    });
    const auditAWSAccountEmail = new CfnParameter(this, 'AuditAWSAccountEmail', {
      type: 'String',
    });
    const makeInitalCommit = new CfnParameter(this, 'makeInitalCommit', {
      type: 'String',
    });

    const notificationsTopic = new Topic(this, 'NotifyLandingZoneAcceleratorInstallerStackUpdates');

    new InstallLandingZoneAccelerator(this, 'InstallLandingZoneAccelerator', {
      lzaVersion: LZA_VERSION,
      logArchiveAwsAccountEmail: logArchiveAWSAccountEmail.valueAsString,
      auditAwsAccountEmail: auditAWSAccountEmail.valueAsString,
      notificationsTopic: notificationsTopic.topicArn,
    });

    const mainConfigDirPath = path.join(__dirname, '..', 'functions', 'configure_landing_zone_accelerator', 'config', 'best-practices');
    const sharedCloudformationConfigDirPath = path.join(
      __dirname,
      '..',
      'functions',
      'configure_controltower_customizations',
      'config',
      'cloudformation',
    );
    const sharedScpConfigDirPath = path.join(
      __dirname,
      '..',
      'functions',
      'configure_controltower_customizations',
      'config',
      'service-control-policies',
    );
    const sharedIamPoliciesDirPath = path.join(
      __dirname,
      '..',
      'functions',
      'configure_controltower_customizations',
      'config',
      'iam-policies',
    );

    const configureLandingZoneAccelerator = new NodejsFunction(this, 'ConfigureLandingZoneAcceleratorFunction', {
      entry: path.join(__dirname, '..', 'functions', 'configure_landing_zone_accelerator', 'configure-landing-zone-accelerator.ts'),
      runtime: Runtime.NODEJS_16_X,
      timeout: Duration.minutes(15),
      environment: {
        LZA_VERSION: LZA_VERSION,
        AUDIT_ACCOUNT_EMAIL: auditAWSAccountEmail.valueAsString,
      },
      bundling: {
        commandHooks: {
          afterBundling: (inputDir: string, outputDir: string): string[] => [
            `cp -r ${mainConfigDirPath}/* ${outputDir}`,
            `cp -r ${sharedCloudformationConfigDirPath} ${outputDir}`,
            `cp -r ${sharedScpConfigDirPath} ${outputDir}`,
            `cp -r ${sharedIamPoliciesDirPath} ${outputDir}`,
          ],
          beforeBundling: (inputDir: string, outputDir: string): string[] => [],
          beforeInstall: (inputDir: string, outputDir: string): string[] => [],
        },
      },
    });
    notificationsTopic.addSubscription(new LambdaSubscription(configureLandingZoneAccelerator));

    (configureLandingZoneAccelerator.node.defaultChild as CfnFunction).overrideLogicalId('ConfigureLandingZoneAcceleratorFunction');
    configureLandingZoneAccelerator.addToRolePolicy(
      new PolicyStatement({
        actions: ['ssm:PutParameter', 'ssm:GetParameter'],
        resources: ['*'],
      }),
    );
    configureLandingZoneAccelerator.addToRolePolicy(
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
    configureLandingZoneAccelerator.addToRolePolicy(
      new PolicyStatement({
        actions: ['codecommit:createCommit', 'codecommit:getBranch', 'codecommit:getRepository'],
        resources: ['*'],
      }),
    );
    configureLandingZoneAccelerator.addToRolePolicy(
      new PolicyStatement({
        actions: ['codecommit:createCommit'],
        resources: [
          Arn.format(
            {
              service: 'codecommit',
              resource: 'repository',
              resourceName: LZA_REPO_NAME,
            },
            Stack.of(this),
          ),
        ],
      }),
    );
  }
}
