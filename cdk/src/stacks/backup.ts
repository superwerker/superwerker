import path from 'path';
import { aws_ssm as ssm, Fn, Arn, aws_cloudformation as cfn, CfnCustomResource, aws_config as config, aws_iam as iam, aws_s3 as s3, custom_resources as cr, NestedStack, NestedStackProps, Stack } from 'aws-cdk-lib';
import { CfnInclude } from 'aws-cdk-lib/cloudformation-include';
import { Construct } from 'constructs';
import endent from 'endent';
import { AttachTagPolicy } from '../constructs/attach-tag-policy';
import { EnableCloudFormationStacksetsOrgAccess } from '../constructs/enable-cfn-stacksets-org';

export class BackupStack extends NestedStack {
  constructor(scope: Construct, id: string, props: NestedStackProps) {
    super(scope, id, props);
    new CfnInclude(this, 'SuperwerkerTemplate', {
      templateFile: path.join(__dirname, '..', '..', '..', 'templates', 'backup.yaml'),
    });

    const orgLookup = new cr.AwsCustomResource(this, 'OrganizationsLookup', {
      onUpdate: {
        service: 'Organizations',
        action: 'describeOrganization',
        // TODO: Do we even need that?
        // physicalResourceId: cr.PhysicalResourceId.of(Date.now().toString()),
      },
      policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
        resources: cr.AwsCustomResourcePolicy.ANY_RESOURCE,
      }),
    });

    const orgConformancePackBucket = new s3.Bucket(this, 'OrganizationConformancePackBucket', {
      bucketName: `awsconfigconforms-${Stack.of(this).account}`,
    });
    (orgConformancePackBucket.node.defaultChild as s3.CfnBucket).overrideLogicalId('OrganizationConformancePackBucket');

    orgConformancePackBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        principals: [
          new iam.AnyPrincipal(),
        ],
        actions: [
          's3:GetObject',
          's3:PutObject',
        ],
        resources: [
          `${orgConformancePackBucket.bucketArn}/*`,
        ],
        conditions: [
          {
            StringEquals: {
              'aws:PrincipalOrgID': orgLookup.getResponseField('Organization.Id'),
            },
          },
          {
            ArnLike: {
              'aws:PrincipalArn': Arn.format({
                partition: Stack.of(this).partition,
                service: 'iam',
                region: '',
                account: '*',
                resource: 'role',
                resourceName: 'aws-service-role/config-conforms.amazonaws.com/AWSServiceRoleForConfigConforms',
              }),
            },
          },
        ],
      }),
    );
    orgConformancePackBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        principals: [
          new iam.AnyPrincipal(),
        ],
        actions: [
          's3:GetBucketAcl',
        ],
        resources: [
          orgConformancePackBucket.bucketArn,
        ],
        conditions: [
          {
            StringEquals: {
              'aws:PrincipalOrgID': orgLookup.getResponseField('Organization.Id'),
            },
          },
          {
            ArnLike: {
              'aws:PrincipalArn': Arn.format({
                partition: Stack.of(this).partition,
                service: 'iam',
                region: '',
                account: '*',
                resource: 'role',
                resourceName: 'aws-service-role/config-conforms.amazonaws.com/AWSServiceRoleForConfigConforms',
              }),
            },
          },
        ],
      }),
    );

    const orgRoots = new cr.AwsCustomResource(this, 'LookupRoots', {
      onUpdate: {
        service: 'Organizations',
        action: 'listRoots',
        // TODO: Do we even need that?
        // physicalResourceId: cr.PhysicalResourceId.of(Date.now().toString()),
      },
      policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
        resources: cr.AwsCustomResourcePolicy.ANY_RESOURCE,
      }),
    });

    const backupResources = new cfn.CfnStackSet(this, 'BackupResources', {
      stackSetName: 'superwerker-backup',
      permissionModel: 'SERVICE_MANAGED',
      operationPreferences: {
        maxConcurrentPercentage: 50,
      },
      capabilities: [
        'CAPABILITY_IAM',
        'CAPABILITY_NAMED_IAM',
      ],
      autoDeployment: {
        enabled: true,
        retainStacksOnAccountRemoval: false,
      },
      stackInstancesGroup: [
        {
          regions: [
            Stack.of(this).region,
          ],
          deploymentTargets: {
            organizationalUnitIds: [
              orgRoots.getResponseField('Roots.0.Id'),
            ],
          },
        },
      ],
      templateBody: endent`
        Resources:
          AWSBackupDefaultServiceRole:
            Type: AWS::IAM::Role
            Properties:
              RoleName: AWSBackupDefaultServiceRole
              Path: /service-role/
              AssumeRolePolicyDocument:
                Version: 2012-10-17
                Statement:
                  - Effect: Allow
                    Principal:
                      Service: backup.amazonaws.com
                    Action: sts:AssumeRole
              ManagedPolicyArns:
                - arn:${Stack.of(this).partition}:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForBackup
                - arn:${Stack.of(this).partition}:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForRestores

          ConfigRemediationRole:
            Type: AWS::IAM::Role
            Properties:
              RoleName: SuperwerkerBackupTagsEnforcementRemediationRole
              AssumeRolePolicyDocument:
                Version: 2012-10-17
                Statement:
                  - Effect: Allow
                    Principal:
                      Service: ssm.amazonaws.com
                    Action: sts:AssumeRole
              Policies:
                - PolicyName: AllowTagging
                  PolicyDocument:
                    Statement:
                      - Effect: Allow
                        Action:
                          - dynamodb:TagResource
                          - ec2:CreateTags
                          - rds:AddTagsToResource
                          - rds:DescribeDBInstances
                        Resource: '*'
        `,
    });
    (backupResources.node.defaultChild as cfn.CfnStackSet).overrideLogicalId('BackupResources');

    new config.CfnOrganizationConformancePack(this, 'BackupTagsEnforcement', {
      excludedAccounts: [
        Stack.of(this).account,
      ],
      organizationConformancePackName: 'superwerker-backup-enforce',
      deliveryS3Bucket: orgConformancePackBucket.bucketName,
      templateBody: Fn.sub(
        endent`
        Resources:
          ConfigRuleDynamoDBTable:
            Type: AWS::Config::ConfigRule
            Properties:
              ConfigRuleName: superwerker-backup-enforce-dynamodb-table
              Scope:
                ComplianceResourceTypes:
                  - AWS::DynamoDB::Table
              InputParameters:
                tag1Key: superwerker:backup
                tag1Value: daily,none
              Source:
                Owner: AWS
                SourceIdentifier: REQUIRED_TAGS

          ConfigRemediationDynamoDBTable:
            DependsOn: ConfigRuleDynamoDBTable
            Type: AWS::Config::RemediationConfiguration
            Properties:
              ConfigRuleName: superwerker-backup-enforce-dynamodb-table
              Automatic: true
              MaximumAutomaticAttempts: 10
              RetryAttemptSeconds: 60
              TargetId: arn:\$\{AWS::Partition}:ssm:\$\{AWS::Region}:\$\{AWS::AccountId}:document/\$\{BackupTagRemediation}
              TargetType: SSM_DOCUMENT
              Parameters:
                ResourceValue:
                  ResourceValue:
                    Value: "RESOURCE_ID"
                AutomationAssumeRole:
                  StaticValue:
                    Values:
                      - arn:\${AWS::Partition}:iam::\${AWS::AccountId}:role/SuperwerkerBackupTagsEnforcementRemediationRole # \${AWS::AccountId} is magically replaced with the actual sub-account id (magic by Conformance Pack)
                ResourceType:
                  StaticValue:
                    Values:
                      - AWS::DynamoDB::Table

          ConfigRuleEbsVolume:
            Type: AWS::Config::ConfigRule
            Properties:
              ConfigRuleName: superwerker-backup-enforce-ebs-volume
              Scope:
                ComplianceResourceTypes:
                  - AWS::EC2::Volume
              InputParameters:
                tag1Key: superwerker:backup
                tag1Value: daily,none
              Source:
                Owner: AWS
                SourceIdentifier: REQUIRED_TAGS

          ConfigRemediationEbsVolume:
            DependsOn: ConfigRuleEbsVolume
            Type: AWS::Config::RemediationConfiguration
            Properties:
              ConfigRuleName: superwerker-backup-enforce-ebs-volume
              Automatic: true
              MaximumAutomaticAttempts: 10
              RetryAttemptSeconds: 60
              TargetId: arn:\${AWS::Partition}:ssm:\${AWS::Region}:\${AWS::AccountId}:document/\${BackupTagRemediation}
              TargetType: SSM_DOCUMENT
              Parameters:
                ResourceValue:
                  ResourceValue:
                    Value: "RESOURCE_ID"
                AutomationAssumeRole:
                  StaticValue:
                    Values:
                      - arn:\${AWS::Partition}:iam::\${AWS::AccountId}:role/SuperwerkerBackupTagsEnforcementRemediationRole # \${AWS::AccountId} is magically replaced with the actual sub-account id (magic by Conformance Pack)
                ResourceType:
                  StaticValue:
                    Values:
                      - AWS::EC2::Volume

          ConfigRuleRdsDbInstance:
            Type: AWS::Config::ConfigRule
            Properties:
              ConfigRuleName: superwerker-backup-enforce-rds-instance
              Scope:
                ComplianceResourceTypes:
                  - AWS::RDS::DBInstance
              InputParameters:
                tag1Key: superwerker:backup
                tag1Value: daily,none
              Source:
                Owner: AWS
                SourceIdentifier: REQUIRED_TAGS

          ConfigRemediationRdsDbInstance:
            DependsOn: ConfigRuleRdsDbInstance
            Type: AWS::Config::RemediationConfiguration
            Properties:
              ConfigRuleName: superwerker-backup-enforce-rds-instance
              Automatic: true
              MaximumAutomaticAttempts: 10
              RetryAttemptSeconds: 60
              TargetId: arn:\${AWS::Partition}:ssm:\${AWS::Region}:\${AWS::AccountId}:document/\${BackupTagRemediation}
              TargetType: SSM_DOCUMENT
              Parameters:
                ResourceValue:
                  ResourceValue:
                    Value: "RESOURCE_ID"
                AutomationAssumeRole:
                  StaticValue:
                    Values:
                      - arn:\${AWS::Partition}:iam::\${AWS::AccountId}:role/SuperwerkerBackupTagsEnforcementRemediationRole # \${AWS::AccountId} is magically replaced with the actual sub-account id (magic by Conformance Pack)
                ResourceType:
                  StaticValue:
                    Values:
                      - AWS::RDS::DBInstance
              `,
      ),
    });

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
        mainSteps: [{
          name: 'synthArn',
          action: 'aws:branch',
          inputs: {
            Choices: [
              {
                NextStep: 'tagDynamoDbTable',
                Variable: '{{ ResourceType }}',
                StringEquals: 'AWS::DynamoDB::Table',
              },
              {
                NextStep: 'tagEbsVolume',
                Variable: '{{ ResourceType }}',
                StringEquals: 'AWS::EC2::Volume',
              },
              {
                NextStep: 'getRdsDBInstanceArnByDbInstanceResourceIdentifier',
                Variable: '{{ ResourceType }}',
                StringEquals: 'AWS::RDS::DBInstance',
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
            ResourceArn: Arn.format({
              partition: Stack.of(this).partition,
              service: 'dynamodb',
              region: '{{ global:REGION }}',
              account: '{{ global:ACCOUNT_ID }}',
              resource: 'table',
              resourceName: '{{ ResourceValue }}',
            }),
            isEnd: true,
          },
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
            Resources: [
              '{{ ResourceValue }}',
            ],
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
                Values: [
                  '{{ ResourceValue }}',
                ],
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
        }],
      },
    });
    (backupTagRemediation.node.defaultChild as ssm.CfnDocument).overrideLogicalId('BackupTagRemediation');

    const backupTagRemediationPublic = new cr.AwsCustomResource(this, 'BackupTagRemediationPublic', {
      onUpdate: {
        service: 'SSM',
        action: 'modifyDocumentPermission',
        parameters: {
          Name: backupTagRemediation.ref,
          PermissionType: 'Share',
          AccountIdsToAdd: ['All'],
        },
      },
      onDelete: {
        service: 'SSM',
        action: 'modifyDocumentPermission',
        parameters: {
          Name: backupTagRemediation.ref,
          PermissionType: 'Share',
          AccountIdsToRemove: ['All'],
        },
      },
    });
    (backupTagRemediationPublic.node.defaultChild as CfnCustomResource).overrideLogicalId('BackupTagRemediationPublic');

    new EnableCloudFormationStacksetsOrgAccess(this, 'EnableCloudFormationStacksetsOrgAccess');

    const attachTagPolicy = new AttachTagPolicy(this, 'TagPolicy', {
      policy: JSON.stringify({
        tags: {
          'superwerker:backup': {
            tag_value: {
              '@@assign': [
                'none',
                'daily',
              ],
            },
            enforced_for: {
              '@@assign': [
                'dynamodb:table',
                'ec2:volume',
              ],
            },
          },
        },
      }),
    });
  }
}

