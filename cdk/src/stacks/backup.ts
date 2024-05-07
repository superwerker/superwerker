import fs from 'fs';
import {
  Arn,
  CfnResource,
  CfnStackSet,
  Duration,
  NestedStack,
  NestedStackProps,
  RemovalPolicy,
  Stack,
  aws_config as config,
  aws_iam as iam,
  aws_s3 as s3,
  aws_ssm as ssm,
} from 'aws-cdk-lib';
import { AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId } from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { BackupPolicy } from '../constructs/backup-policy';
import { BackupPolicyEnable } from '../constructs/backup-policy-enable';
import { BackupTagPolicy } from '../constructs/backup-tag-policy';
import { BackupTagPolicyEnable } from '../constructs/backup-tag-policy-enable';
import { BackupTagRemediationPublic } from '../constructs/backup-tag-remediation-public';

export class BackupStack extends NestedStack {
  constructor(scope: Construct, id: string, props: NestedStackProps) {
    super(scope, id, props);

    const describeOrganizationOutput = new AwsCustomResource(this, 'OrganizationsLookup', {
      installLatestAwsSdk: true,
      onUpdate: {
        service: 'organizations',
        action: 'describeOrganization',
        physicalResourceId: PhysicalResourceId.of('Organization'),
      },
      onCreate: {
        service: 'organizations',
        action: 'describeOrganization',
        physicalResourceId: PhysicalResourceId.of('Organization'),
      },
      policy: AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          resources: ['*'],
          actions: ['organizations:DescribeOrganization'],
          effect: iam.Effect.ALLOW,
        }),
      ]),
    });
    ((describeOrganizationOutput.node.findChild('Resource') as CfnResource).node.defaultChild as CfnResource).overrideLogicalId(
      'OrganizationsLookup',
    );

    const orgId = describeOrganizationOutput.getResponseField('Organization.Id');

    // Conformance Pack Bucket
    const conformancePackBucket = new s3.Bucket(this, 'OrganizationConformancePackBucket', {
      bucketName: `awsconfigconforms-${Stack.of(this).account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
    });
    (conformancePackBucket.node.defaultChild as CfnResource).overrideLogicalId('OrganizationConformancePackBucket');
    conformancePackBucket.applyRemovalPolicy(RemovalPolicy.RETAIN);

    conformancePackBucket.grantPut(new iam.ServicePrincipal('ses.amazonaws.com'), 'RootMail/*');
    (conformancePackBucket.policy!.node.defaultChild as CfnResource).overrideLogicalId('OrganizationConformancePackBucketPolicy');

    // AllowGetPutObject
    conformancePackBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AllowGetPutObject',
        effect: iam.Effect.ALLOW,
        principals: [new iam.AnyPrincipal()],
        actions: ['s3:GetObject', 's3:PutObject'],
        resources: [conformancePackBucket.arnForObjects('*')],
        conditions: {
          StringEquals: {
            'aws:PrincipalOrgID': orgId,
          },
          ArnLike: {
            'aws:PrincipalArn': `arn:${Stack.of(this).partition}:iam::*:role/aws-service-role/config-conforms.amazonaws.com/AWSServiceRoleForConfigConforms`,
          },
        },
      }),
    );

    // AllowGetBucketAcl
    conformancePackBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AllowGetBucketAcl',
        effect: iam.Effect.ALLOW,
        principals: [new iam.AnyPrincipal()],
        actions: ['s3:GetBucketAcl'],
        resources: [conformancePackBucket.bucketArn],
        conditions: {
          StringEquals: {
            'aws:PrincipalOrgID': orgId,
          },
          ArnLike: {
            'aws:PrincipalArn': `arn:${Stack.of(this).partition}:iam::*:role/aws-service-role/config-conforms.amazonaws.com/AWSServiceRoleForConfigConforms`,
          },
        },
      }),
    );

    const backupTagRemediation = new ssm.CfnDocument(this, 'BackupTagRemediation', {
      documentType: 'Automation',
      content: {
        schemaVersion: '0.3',
        assumeRole: '{{ AutomationAssumeRole }}',
        parameters: {
          ResourceValue: {
            type: 'String',
          },
          AutomationAssumeRole: {
            type: 'String',
            default: '',
          },
          ResourceType: {
            type: 'String',
          },
        },
        mainSteps: [
          {
            name: 'synthArn',
            action: 'aws:branch',
            inputs: {
              Choices: [
                {
                  Variable: '{{ ResourceType }}',
                  StringEquals: 'AWS::DynamoDB::Table',
                  NextStep: 'tagDynamoDbTable',
                },
                {
                  Variable: '{{ ResourceType }}',
                  StringEquals: 'AWS::EC2::Volume',
                  NextStep: 'tagEbsVolume',
                },
                {
                  Variable: '{{ ResourceType }}',
                  StringEquals: 'AWS::RDS::DBInstance',
                  NextStep: 'getRdsDBInstanceArnByDbInstanceResourceIdentifier',
                },
              ],
            },
          },
          {
            name: 'tagDynamoDbTable',
            action: 'aws:executeAwsApi',
            inputs: {
              Service: 'dynamodb',
              Api: 'TagResource',
              Tags: [
                {
                  Key: 'superwerker:backup',
                  Value: 'daily',
                },
              ],
              ResourceArn: `arn:${Stack.of(this).partition}:dynamodb:{{ global:REGION }}:{{ global:ACCOUNT_ID }}:table/{{ ResourceValue }}`,
            },
            isEnd: true,
          },
          {
            name: 'tagEbsVolume',
            action: 'aws:executeAwsApi',
            inputs: {
              Service: 'ec2',
              Api: 'CreateTags',
              Tags: [
                {
                  Key: 'superwerker:backup',
                  Value: 'daily',
                },
              ],
              Resources: ['{{ ResourceValue }}'],
            },
            isEnd: true,
          },
          {
            name: 'getRdsDBInstanceArnByDbInstanceResourceIdentifier',
            action: 'aws:executeAwsApi',
            inputs: {
              Service: 'rds',
              Api: 'DescribeDBInstances',
              Filters: [
                {
                  Name: 'dbi-resource-id',
                  Values: ['{{ ResourceValue }}'],
                },
              ],
            },
            outputs: [
              {
                Name: 'DBInstanceArn',
                Selector: '$.DBInstances[0].DBInstanceArn',
              },
            ],
          },
          {
            name: 'tagRdsInstance',
            action: 'aws:executeAwsApi',
            inputs: {
              Service: 'rds',
              Api: 'AddTagsToResource',
              Tags: [
                {
                  Key: 'superwerker:backup',
                  Value: 'daily',
                },
              ],
              ResourceName: '{{ getRdsDBInstanceArnByDbInstanceResourceIdentifier.DBInstanceArn }}',
            },
            isEnd: true,
          },
        ],
      },
    });
    backupTagRemediation.overrideLogicalId('BackupTagRemediation');

    const backupTagRemediationPublic = new BackupTagRemediationPublic(this, 'BackupTagRemediationPublic', {
      documentName: backupTagRemediation.ref,
    });
    ((backupTagRemediationPublic.node.findChild('Resource') as CfnResource).node.defaultChild as CfnResource).overrideLogicalId(
      'BackupTagRemediationPublic',
    );

    // EnableCloudFormationStacksetsOrgAccessCustomResourceRole
    const enableCloudFormationStacksetsOrgAccessCustomResourceRole = new iam.Role(
      this,
      'EnableCloudFormationStacksetsOrgAccessCustomResourceRole',
      {
        assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
        managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess')],
      },
    );
    (enableCloudFormationStacksetsOrgAccessCustomResourceRole.node.defaultChild as CfnResource).overrideLogicalId(
      'EnableCloudFormationStacksetsOrgAccessCustomResourceRole',
    );

    // EnableCloudFormationStacksetsOrgAccessCustomResourceRolePolicy
    const enableCloudFormationStacksetsOrgAccessCustomResourceRolePolicy = new iam.Policy(
      this,
      'EnableCloudFormationStacksetsOrgAccessCustomResourceRolePolicy',
      {
        policyName: 'EnableCloudFormationStacksetsOrgAccessCustomResourceRolePolicy',
        statements: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['sts:AssumeRole'],
            resources: [enableCloudFormationStacksetsOrgAccessCustomResourceRole.roleArn],
          }),
        ],
        roles: [enableCloudFormationStacksetsOrgAccessCustomResourceRole],
      },
    );
    (enableCloudFormationStacksetsOrgAccessCustomResourceRolePolicy.node.defaultChild as CfnResource).overrideLogicalId(
      'EnableCloudFormationStacksetsOrgAccessCustomResourceRolePolicy',
    );

    const enableCloudFormationStacksetsOrgAccess = new AwsCustomResource(this, 'EnableCloudFormationStacksetsOrgAccess', {
      installLatestAwsSdk: true,
      onUpdate: {
        service: 'cloudformation',
        action: 'activate_organizations_access',
        physicalResourceId: PhysicalResourceId.of('Organization'),
      },
      onCreate: {
        service: 'cloudformation',
        action: 'activate_organizations_access',
        physicalResourceId: PhysicalResourceId.of('Organization'),
      },
      role: enableCloudFormationStacksetsOrgAccessCustomResourceRole,
      policy: AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          resources: ['*'],
          actions: ['organizations:DescribeOrganization'],
          effect: iam.Effect.ALLOW,
        }),
      ]),
      timeout: Duration.seconds(900), // give it more time since it installs dependencies on the fly
    });
    ((enableCloudFormationStacksetsOrgAccess.node.findChild('Resource') as CfnResource).node.defaultChild as CfnResource).overrideLogicalId(
      'EnableCloudFormationStacksetsOrgAccessCustomResource',
    );

    const backupRolesStackSet = new CfnStackSet(this, 'BackupResources', {
      permissionModel: 'SERVICE_MANAGED',
      stackSetName: Stack.of(this).stackName,
      capabilities: ['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM'],
      autoDeployment: {
        enabled: true,
        retainStacksOnAccountRemoval: false,
      },
      stackInstancesGroup: [
        {
          deploymentTargets: {
            organizationalUnitIds: [orgId],
          },
          regions: [Stack.of(this).region],
        },
      ],
      templateBody: fs.readFileSync('./src/stacks/backup-service-remediation-role-stackset.yaml').toString(),
    });
    backupRolesStackSet.overrideLogicalId('BackupResources');
    backupRolesStackSet.node.addDependency(enableCloudFormationStacksetsOrgAccess);

    const backupTagsEnforcement = new config.CfnOrganizationConformancePack(this, 'BackupTagsEnforcement', {
      organizationConformancePackName: 'superwerker-backup-enforce',
      templateBody: fs.readFileSync('./src/stacks/backup-organization-conformance-pack.yaml').toString(),
      deliveryS3Bucket: conformancePackBucket.bucketName,
      deliveryS3KeyPrefix: 'BackupTagsEnforcement',
      excludedAccounts: [Stack.of(this).account], // exclude management account since it has no config recorder set up
    });
    backupTagsEnforcement.overrideLogicalId('BackupTagsEnforcement');
    backupTagsEnforcement.node.addDependency(backupRolesStackSet);

    // Proudly found elsewhere and partially copied from:
    // https://github.com/theserverlessway/aws-baseline
    const backupTagPolicyEnable = new BackupTagPolicyEnable(this, 'TagPolicyEnable');
    ((backupTagPolicyEnable.node.findChild('Resource') as CfnResource).node.defaultChild as CfnResource).overrideLogicalId(
      'TagPolicyEnable',
    );

    const backupTagPolicy = new BackupTagPolicy(this, 'TagPolicy', {
      policy: JSON.stringify({
        tags: {
          'superwerker:backup': {
            tag_value: ['none', 'daily'],
            enforced_for: ['dynamodb:table', 'ec2:volume'],
          },
        },
      }),
      attach: true,
    });
    backupTagPolicy.node.addDependency(backupTagPolicyEnable.node.defaultChild as CfnResource);
    ((backupTagPolicy.node.findChild('Resource') as CfnResource).node.defaultChild as CfnResource).overrideLogicalId('TagPolicy');

    const backupPolicyEnable = new BackupPolicyEnable(this, 'BackupPolicyEnable');
    ((backupPolicyEnable.node.findChild('Resource') as CfnResource).node.defaultChild as CfnResource).overrideLogicalId(
      'BackupPolicyEnable',
    );

    const backupPolicy = new BackupPolicy(this, 'BackupPolicy', {
      policy: JSON.stringify({
        plans: {
          'superwerker-backup': {
            regions: [Stack.of(this).region],
            rules: {
              'backup-daily': {
                lifecycle: {
                  delete_after_days: 30,
                },
                target_backup_vault_name: 'Default',
              },
            },
            selections: {
              tags: {
                'backup-daily': {
                  iam_role_arn: Arn.format(
                    {
                      service: 'iam',
                      resource: 'role/service-role/AWSBackupDefaultServiceRole',
                    },
                    Stack.of(this),
                  ),
                  tag_key: 'superwerker:backup',
                  tag_value: ['daily'],
                },
              },
            },
          },
        },
      }),
      attach: true,
    });
    ((backupPolicy.node.findChild('Resource') as CfnResource).node.defaultChild as CfnResource).overrideLogicalId('BackupPolicy');
    backupPolicy.node.addDependency(backupPolicyEnable.node.defaultChild as CfnResource);
  }
}
