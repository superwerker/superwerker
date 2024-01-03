import path from 'path';
import { Arn, CfnParameter, Duration, NestedStack, NestedStackProps, Stack } from 'aws-cdk-lib';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { CfnFunction, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { LambdaSubscription } from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';
import { InstallLandingZoneAccelerator } from '../constructs/install-landing-zone-accelerator';

const LZA_REPO_NAME = 'landing-zone-accelerator';
const LZA_VERSION = 'v1.5.2';
const LZA_DONE_SSM_PARAMETER = '/superwerker/initial-lza-config-done';

export class LandingZoneAcceleratorStack extends NestedStack {
  constructor(scope: Construct, id: string, props: NestedStackProps) {
    super(scope, id, props);

    const logArchiveAWSAccountEmail = new CfnParameter(this, 'LogArchiveAWSAccountEmail', {
      type: 'String',
    });
    const auditAWSAccountEmail = new CfnParameter(this, 'AuditAWSAccountEmail', {
      type: 'String',
    });

    const notificationsTopic = new Topic(this, 'NotifyLandingZoneAcceleratorInstallerStackUpdates');

    new InstallLandingZoneAccelerator(this, 'InstallLandingZoneAccelerator', {
      lzaVersion: LZA_VERSION,
      logArchiveAwsAccountEmail: logArchiveAWSAccountEmail.valueAsString,
      auditAwsAccountEmail: auditAWSAccountEmail.valueAsString,
      notificationsTopic: notificationsTopic.topicArn,
      ssmParameterName: LZA_DONE_SSM_PARAMETER,
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
      runtime: Runtime.NODEJS_18_X,
      timeout: Duration.minutes(5),
      environment: {
        LZA_VERSION: LZA_VERSION,
        AUDIT_ACCOUNT_EMAIL: auditAWSAccountEmail.valueAsString,
      },
      bundling: {
        commandHooks: {
          afterBundling: (_inputDir: string, outputDir: string): string[] => [
            `cp -r ${mainConfigDirPath}/* ${outputDir}`,
            `cp -r ${sharedCloudformationConfigDirPath} ${outputDir}`,
            `cp -r ${sharedScpConfigDirPath} ${outputDir}`,
            `cp -r ${sharedIamPoliciesDirPath} ${outputDir}`,
          ],
          beforeBundling: (_inputDir: string, _outputDir: string): string[] => [],
          beforeInstall: (_inputDir: string, _outputDir: string): string[] => [],
        },
      },
    });
    (configureLandingZoneAccelerator.node.defaultChild as CfnFunction).overrideLogicalId('ConfigureLandingZoneAcceleratorFunction');

    notificationsTopic.addSubscription(new LambdaSubscription(configureLandingZoneAccelerator));

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
