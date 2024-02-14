import { CfnParameter, NestedStack, NestedStackProps, RemovalPolicy, aws_iam as iam } from 'aws-cdk-lib';
import { CfnLandingZone } from 'aws-cdk-lib/aws-controltower';
import { CfnRole } from 'aws-cdk-lib/aws-iam';
import { CfnAccount } from 'aws-cdk-lib/aws-organizations';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { PrepareStack } from './prepare';
import { SuperwerkerBootstrap } from '../constructs/superwerker-bootstrap';

export class ControlTowerStack extends NestedStack {
  constructor(scope: Construct, id: string, props: NestedStackProps) {
    super(scope, id, props);

    const logArchiveAWSAccountEmail = new CfnParameter(this, 'LogArchiveAWSAccountEmail', {
      type: 'String',
    });
    const auditAWSAccountEmail = new CfnParameter(this, 'AuditAWSAccountEmail', {
      type: 'String',
    });

    const logArchiveAccount = new CfnAccount(this, 'LogArchiveAccount', {
      accountName: 'Log Archive',
      email: logArchiveAWSAccountEmail.valueAsString,
    });
    logArchiveAccount.applyRemovalPolicy(RemovalPolicy.RETAIN);

    // due to legacy reasons and dependencies these parameters are named diffrently and managed seperately
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

    const ctVersion = ssm.StringParameter.fromStringParameterAttributes(this, 'ControlTowerVersionParameterLookup', {
      parameterName: PrepareStack.controlTowerVersionParameter,
      forceDynamicReference: true,
    }).stringValue;

    const ctGovernedRegions = ssm.StringListParameter.fromListParameterAttributes(this, 'GovernedRegionsParameterLookup', {
      parameterName: PrepareStack.controlTowerRegionsParameter,
    }).stringListValue;

    const ctKmsKeyArn = ssm.StringParameter.fromStringParameterAttributes(this, 'KmsKeyParameterLookup', {
      parameterName: PrepareStack.controlTowerKmsKeyParameter,
    }).stringValue;

    const ctBucketRetetionLogging = ssm.StringParameter.fromStringParameterAttributes(this, 'BucketRetetionLoggingParameterLookup', {
      parameterName: PrepareStack.controlTowerBucketRetetionLoggingParameter,
      forceDynamicReference: true,
    }).stringValue;

    const ctBucketRetetionAccessLogging = ssm.StringParameter.fromStringParameterAttributes(
      this,
      'BucketRetetionAccessLoggingParameterLookup',
      {
        parameterName: PrepareStack.controlTowerBucketRetetionAccessLoggingParameter,
        forceDynamicReference: true,
      },
    ).stringValue;

    const SECURITY_OU_NAME = ssm.StringParameter.fromStringParameterAttributes(this, 'SecurityOuParameterLookup', {
      parameterName: PrepareStack.controlTowerSecurityOuSsmParameter,
      forceDynamicReference: true,
    }).stringValue;

    const SANDBOX_OU_NAME = ssm.StringParameter.fromStringParameterAttributes(this, 'SandboxOuParameterLookup', {
      parameterName: PrepareStack.controlTowerSandboxOuSsmParameter,
      forceDynamicReference: true,
    }).stringValue;

    const landingZone = new CfnLandingZone(this, 'LandingZone', {
      manifest: {
        governedRegions: ctGovernedRegions,
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
              retentionDays: ctBucketRetetionLogging,
            },
            accessLoggingBucket: {
              retentionDays: ctBucketRetetionAccessLogging,
            },
            kmsKeyArn: ctKmsKeyArn,
          },
          enabled: true,
        },
      },
      version: ctVersion,
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
    );

    //create function to trigger enabling of features after landing zone has been installed
    const superwerkerBootstrap = new SuperwerkerBootstrap(this, 'SuperwerkerBootstrap');
    superwerkerBootstrap.node.addDependency(landingZone);
  }
}
