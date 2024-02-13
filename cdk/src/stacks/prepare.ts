import { Arn, CfnWaitCondition, CfnWaitConditionHandle, NestedStack, NestedStackProps, RemovalPolicy, Stack, Tags } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';
import { PrepareAccount } from '../constructs/prepare-account';

export class PrepareStack extends NestedStack {
  static controlTowerVersionParameter = '/superwerker/controltower/version';
  static controlTowerRegionsParameter = '/superwerker/controltower/regions';
  static controlTowerKmsKeyParameter = '/superwerker/controltower/kms_key';
  static controlTowerSecurityOuSsmParameter = '/superwerker/controltower/security_ou_name';
  static controlTowerSandboxOuSsmParameter = '/superwerker/controltower/sandbox_ou_name';
  static controlTowerBucketRetetionLoggingParameter = '/superwerker/controltower/bucket_retention_logging';
  static controlTowerBucketRetetionAccessLoggingParameter = '/superwerker/controltower/bucket_retention_access_logging';

  constructor(scope: Construct, id: string, props: NestedStackProps) {
    super(scope, id, props);

    // Create KMS key for Control Tower
    const controlTowerKmsKey = new kms.Key(this, 'AWSControlTowerKMSKey', {
      description: 'KMS key used by AWS Control Tower',
      enableKeyRotation: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    Tags.of(controlTowerKmsKey).add('Name', 'superwerker-control-tower');
    controlTowerKmsKey.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'Allow Config to use KMS for encryption',
        actions: ['kms:Decrypt', 'kms:GenerateDataKey'],
        principals: [new iam.ServicePrincipal('config.amazonaws.com')],
        resources: [
          Arn.format(
            {
              service: 'kms',
              resource: 'key',
              resourceName: '*',
            },
            Stack.of(this),
          ),
        ],
      }),
    );
    controlTowerKmsKey.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'Allow CloudTrail to use KMS for encryption',
        actions: ['kms:GenerateDataKey*', 'kms:Decrypt'],
        principals: [new iam.ServicePrincipal('cloudtrail.amazonaws.com')],
        resources: [
          Arn.format(
            {
              service: 'kms',
              resource: 'key',
              resourceName: '*',
            },
            Stack.of(this),
          ),
        ],
        conditions: {
          StringEquals: {
            'aws:SourceArn': Arn.format(
              {
                service: 'cloudtrail',
                resource: 'trail',
                resourceName: 'aws-controltower-BaselineCloudTrail',
              },
              Stack.of(this),
            ),
          },
          StringLike: {
            'kms:EncryptionContext:aws:cloudtrail:arn': Arn.format(
              {
                service: 'cloudtrail',
                resource: 'trail',
                region: '*',
                resourceName: '*',
              },
              Stack.of(this),
            ),
          },
        },
      }),
    );

    // only waits on the first time the stack is created
    const prepareAccountReadyHandle = new CfnWaitConditionHandle(this, 'prepareAccountReadyHandle');
    new CfnWaitCondition(this, 'prepareAccountWaitCondtion', {
      handle: prepareAccountReadyHandle.ref,
      timeout: '300', // fail after 5 minutes of no signal
    });

    const prepareAccount = new PrepareAccount(this, 'CreateOrganizations', {
      orgCreatedSignal: prepareAccountReadyHandle.ref,
      controlTowerVersionParameter: PrepareStack.controlTowerVersionParameter,
      controlTowerRegionsParameter: PrepareStack.controlTowerRegionsParameter,
      controlTowerKmsKeyParameter: PrepareStack.controlTowerKmsKeyParameter,
      controlTowerKmsKeyArn: controlTowerKmsKey.keyArn,
      controlTowerSecurityOuSsmParameter: PrepareStack.controlTowerSecurityOuSsmParameter,
      controlTowerSandboxOuSsmParameter: PrepareStack.controlTowerSandboxOuSsmParameter,
      controlTowerBucketRetetionLoggingParameter: PrepareStack.controlTowerBucketRetetionLoggingParameter,
      controlTowerBucketRetetionAccessLoggingParameter: PrepareStack.controlTowerBucketRetetionAccessLoggingParameter,
    });
    prepareAccount.node.addDependency(controlTowerKmsKey);
  }
}
