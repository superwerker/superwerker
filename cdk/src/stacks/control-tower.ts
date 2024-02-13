import {
  Arn,
  CfnParameter,
  CfnWaitCondition,
  CfnWaitConditionHandle,
  NestedStack,
  NestedStackProps,
  RemovalPolicy,
  Stack,
  Tags,
  aws_iam as iam,
} from 'aws-cdk-lib';
import { CfnLandingZone } from 'aws-cdk-lib/aws-controltower';
import { CfnRole } from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import { CfnAccount } from 'aws-cdk-lib/aws-organizations';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { CreateOrganizations } from '../constructs/create-organizations';
import { SuperwerkerBootstrap } from '../constructs/superwerker-bootstrap';

export class ControlTowerStack extends NestedStack {
  constructor(scope: Construct, id: string, props: NestedStackProps) {
    super(scope, id, props);

    const controlTowerVersionParameter = '/superwerker/control_tower_version';
    const controlTowerRegionsParameter = '/superwerker/control_tower_regions';
    const bucketRetetionLoggingParameter = '/superwerker/bucket_retention_logging';
    const bucketRetetionAccessLoggingParameter = '/superwerker/bucket_retention_access_logging';
    const securityOuSsmParameter = '/superwerker/security_ou_name';
    const sandboxOuSsmParameter = '/superwerker/sandbox_ou_name';

    const logArchiveAWSAccountEmail = new CfnParameter(this, 'LogArchiveAWSAccountEmail', {
      type: 'String',
    });
    const auditAWSAccountEmail = new CfnParameter(this, 'AuditAWSAccountEmail', {
      type: 'String',
    });

    // create function to create organizations if not already created
    const organisationCreatedReadyHandle = new CfnWaitConditionHandle(this, 'organisationCreatedReadyHandle');
    const orgWaitCondition = new CfnWaitCondition(this, 'organisationCreatedWaitCondtion', {
      handle: organisationCreatedReadyHandle.ref,
      timeout: '300', // fail after 5 minutes of no signal
    });
    new CreateOrganizations(this, 'CreateOrganizations', {
      orgCreatedSignal: organisationCreatedReadyHandle.ref,
      controlTowerVersionParameter: controlTowerVersionParameter,
      controlTowerRegionsParameter: controlTowerRegionsParameter,
      securityOuSsmParameter: securityOuSsmParameter,
      sandboxOuSsmParameter: sandboxOuSsmParameter,
      bucketRetetionLoggingParameter: bucketRetetionLoggingParameter,
      bucketRetetionAccessLoggingParameter: bucketRetetionAccessLoggingParameter,
    });

    const logArchiveAccount = new CfnAccount(this, 'LogArchiveAccount', {
      accountName: 'Log Archive',
      email: logArchiveAWSAccountEmail.valueAsString,
    });
    logArchiveAccount.node.addDependency(orgWaitCondition);
    logArchiveAccount.applyRemovalPolicy(RemovalPolicy.RETAIN);

    const logArchiveParam = new ssm.StringParameter(this, 'LogArchiveAccountParameter', {
      description: '(superwerker) account id of logarchive account',
      parameterName: '/superwerker/account_id_logarchive',
      stringValue: logArchiveAccount.attrAccountId,
    });
    (logArchiveParam.node.defaultChild as ssm.CfnParameter).overrideLogicalId('LogArchiveAccountParameter');
    logArchiveParam.applyRemovalPolicy(RemovalPolicy.DESTROY);

    const auditAccount = new CfnAccount(this, 'AuditAccount', {
      accountName: 'Audit',
      email: auditAWSAccountEmail.valueAsString,
    });
    auditAccount.node.addDependency(orgWaitCondition);
    auditAccount.applyRemovalPolicy(RemovalPolicy.RETAIN);

    const auditAccountParam = new ssm.StringParameter(this, 'AuditAccountParameter', {
      description: '(superwerker) account id of audit account',
      parameterName: '/superwerker/account_id_audit',
      stringValue: auditAccount.attrAccountId,
    });
    (auditAccountParam.node.defaultChild as ssm.CfnParameter).overrideLogicalId('AuditAccountParameter');
    auditAccountParam.applyRemovalPolicy(RemovalPolicy.DESTROY);

    // Roles and Policies required by Control Tower
    // https://docs.aws.amazon.com/controltower/latest/userguide/lz-apis-cfn-setup.html
    const controlTowerAdminRole = new iam.Role(this, 'AWSControlTowerAdmin', {
      roleName: 'AWSControlTowerAdmin',
      assumedBy: new iam.ServicePrincipal('controltower.amazonaws.com'),
      path: '/service-role/',
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSControlTowerServiceRolePolicy')],
      inlinePolicies: {
        AWSControlTowerAdminPolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['ec2:DescribeAvailabilityZones'],
              resources: ['*'],
            }),
          ],
        }),
      },
    });
    (controlTowerAdminRole.node.defaultChild as CfnRole).overrideLogicalId('AWSControlTowerAdmin');
    controlTowerAdminRole.applyRemovalPolicy(RemovalPolicy.DESTROY);

    const controlTowerCloudTrailRole = new iam.Role(this, 'AWSControlTowerCloudTrailRole', {
      roleName: 'AWSControlTowerCloudTrailRole',
      assumedBy: new iam.ServicePrincipal('cloudtrail.amazonaws.com'),
      path: '/service-role/',
      inlinePolicies: {
        AWSControlTowerCloudTrailRolePolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
              resources: ['arn:aws:logs:*:*:log-group:aws-controltower/CloudTrailLogs:*'],
            }),
          ],
        }),
      },
    });
    (controlTowerCloudTrailRole.node.defaultChild as CfnRole).overrideLogicalId('AWSControlTowerCloudTrailRole');
    controlTowerCloudTrailRole.applyRemovalPolicy(RemovalPolicy.DESTROY);

    const controlTowerConfigAggregatorRole = new iam.Role(this, 'AWSControlTowerConfigAggregatorRoleForOrganizations', {
      roleName: 'AWSControlTowerConfigAggregatorRoleForOrganizations',
      assumedBy: new iam.ServicePrincipal('config.amazonaws.com'),
      path: '/service-role/',
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSConfigRoleForOrganizations')],
    });
    (controlTowerConfigAggregatorRole.node.defaultChild as CfnRole).overrideLogicalId(
      'AWSControlTowerConfigAggregatorRoleForOrganizations',
    );
    controlTowerConfigAggregatorRole.applyRemovalPolicy(RemovalPolicy.DESTROY);

    const controlTowerStackSetRole = new iam.Role(this, 'AWSControlTowerStackSetRole', {
      roleName: 'AWSControlTowerStackSetRole',
      assumedBy: new iam.ServicePrincipal('cloudformation.amazonaws.com'),
      path: '/service-role/',
      inlinePolicies: {
        AWSControlTowerStackSetRolePolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['sts:AssumeRole'],
              resources: ['arn:aws:iam::*:role/AWSControlTowerExecution'],
            }),
          ],
        }),
      },
    });
    (controlTowerStackSetRole.node.defaultChild as CfnRole).overrideLogicalId('AWSControlTowerStackSetRole');
    controlTowerStackSetRole.applyRemovalPolicy(RemovalPolicy.DESTROY);

    // Create KMS key for Control Tower
    const controlTowerKmsKey = new kms.Key(this, 'AWSControlTowerKMSKey', {
      description: 'KMS key used by AWS Control Tower',
      enableKeyRotation: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    Tags.of(controlTowerKmsKey).add('Name', 'superwerker');
    Tags.of(controlTowerKmsKey).add('Purpose', 'ControlTower');
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

    const CONTROL_TOWER_VERSION = ssm.StringParameter.fromStringParameterAttributes(this, 'ControlTowerVersionParameterLookup', {
      parameterName: controlTowerVersionParameter,
      forceDynamicReference: true,
    }).stringValue;

    const REGIONS = ssm.StringListParameter.fromListParameterAttributes(this, 'RegionsParameterLookup', {
      parameterName: controlTowerRegionsParameter,
    }).stringListValue;

    const BUCKET_RETENTION_LOGGING = ssm.StringParameter.fromStringParameterAttributes(this, 'BucketRetetionLoggingParameterLookup', {
      parameterName: bucketRetetionLoggingParameter,
      forceDynamicReference: true,
    }).stringValue;

    const BUCKET_RETENTION_ACCESS_LOGGING = ssm.StringParameter.fromStringParameterAttributes(
      this,
      'BucketRetetionAccessLoggingParameterLookup',
      {
        parameterName: bucketRetetionAccessLoggingParameter,
        forceDynamicReference: true,
      },
    ).stringValue;

    const SECURITY_OU_NAME = ssm.StringParameter.fromStringParameterAttributes(this, 'SecurityOuParameterLookup', {
      parameterName: securityOuSsmParameter,
      forceDynamicReference: true,
    }).stringValue;

    const SANDBOX_OU_NAME = ssm.StringParameter.fromStringParameterAttributes(this, 'SandboxOuParameterLookup', {
      parameterName: sandboxOuSsmParameter,
      forceDynamicReference: true,
    }).stringValue;

    const landingZone = new CfnLandingZone(this, 'LandingZone', {
      manifest: {
        governedRegions: REGIONS,
        organizationStructure: {
          security: {
            name: SECURITY_OU_NAME,
          },
          sandbox: {
            name: SANDBOX_OU_NAME,
          },
        },
        securityRoles: {
          accountId: auditAccount.attrAccountId,
        },
        accessManagement: {
          enabled: true,
        },
        centralizedLogging: {
          accountId: logArchiveAccount.attrAccountId,
          configurations: {
            loggingBucket: {
              retentionDays: BUCKET_RETENTION_LOGGING,
            },
            accessLoggingBucket: {
              retentionDays: BUCKET_RETENTION_ACCESS_LOGGING,
            },
          },
          enabled: true,
          kmsKeyArn: controlTowerKmsKey.keyArn,
        },
      },
      version: CONTROL_TOWER_VERSION,
      tags: [
        {
          key: 'Name',
          value: 'superwerker',
        },
      ],
    });
    landingZone.applyRemovalPolicy(RemovalPolicy.DESTROY);
    landingZone.node.addDependency(
      controlTowerAdminRole,
      controlTowerStackSetRole,
      controlTowerCloudTrailRole,
      controlTowerConfigAggregatorRole,
      logArchiveAccount,
      auditAccount,
      orgWaitCondition,
    );

    //create function to trigger enabling of features after landing zone has been installed
    const superwerkerBootstrap = new SuperwerkerBootstrap(this, 'SuperwerkerBootstrap');
    superwerkerBootstrap.node.addDependency(landingZone);
  }
}
