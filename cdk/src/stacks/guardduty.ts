//import path from 'path';
import { Arn, aws_events as events, aws_iam as iam, aws_ssm as ssm, NestedStack, NestedStackProps, Stack } from 'aws-cdk-lib';
//import { CfnInclude } from 'aws-cdk-lib/cloudformation-include';
import { Construct } from 'constructs';

export class GuardDutyStack extends NestedStack {
  constructor(scope: Construct, id: string, props: NestedStackProps) {
    super(scope, id, props);

    const enableGuardDutyExistingAccounts = new ssm.CfnDocument(this, 'EnableGuardDutyExistingAccounts', {
      documentType: 'Automation',
      content: {
        schemaVersion: '0.3',
        parameters: {
          LogArchiveAWSAccountId: {
            type: 'String',
          },
          ManagementAWSAccountId: {
            type: 'String',
          },
        },
        mainSteps: [{
          name: 'GetDetectorId',
          action: 'aws:executeAwsApi',
          inputs: {
            Service: 'guardduty',
            Api: 'ListDetectors',
          },
          outputs: [{
            Name: 'DetectorId',
            Selector: '$.DetectorIds[0]',
          }],
        }, {
          name: 'ManagementAWSAccount',
          action: 'aws:executeAwsApi',
          inputs: {
            Service: 'organizations',
            Api: 'DescribeAccount',
            AccountId: '{{ ManagementAWSAccountId }}',
          },
          outputs: [{
            Name: 'EmailAddress',
            Selector: '$.Account.Email',
          }],
        }, {
          name: 'LogArchiveAWSAccount',
          action: 'aws:executeAwsApi',
          inputs: {
            Service: 'organizations',
            Api: 'DescribeAccount',
            AccountId: '{{ LogArchiveAWSAccountId }}',
          },
          outputs: [{
            Name: 'EmailAddress',
            Selector: '$.Account.Email',
          }],
        }, {
          name: 'CreateMembers',
          action: 'aws:executeAwsApi',
          inputs: {
            Service: 'guardduty',
            Api: 'CreateMembers',
            DetectorId: '{{ GetDetectorId.DetectorId }}',
            AccountDetails: [{
              AccountId: '{{ ManagementAWSAccountId }}',
              Email: '{{ ManagementAWSAccount.EmailAddress }}',
            }, {
              AccountId: '{{ LogArchiveAWSAccountId }}',
              Email: '{{ LogArchiveAWSAccount.EmailAddress }}',
            }],
          },
        }, {
          name: 'EnableGuardDutyExistingAccounts',
          action: 'aws:executeAwsApi',
          inputs: {
            Service: 'guardduty',
            Api: 'UpdateOrganizationConfiguration',
            DetectorId: '{{ GetDetectorId.DetectorId }}',
            AutoEnable: 'true',
          },
        }],
      },
    });


    const enableGuardDutyS3DataProtectionForOrganization = new ssm.CfnDocument(this, 'EnableGuardDutyS3DataProtectionForOrganization', {
      documentType: 'Automation',
      content: {
        schemaVersion: '0.3',
        mainSteps: [{
          name: 'GetDetectorId',
          action: 'aws:executeAwsApi',
          inputs: {
            Service: 'guardduty',
            Api: 'ListDetectors',
          },
          outputs: [{
            Name: 'DetectorId',
            Selector: '$.DetectorIds[0]',
          }],
        }, {
          name: 'EnableGuardDutyS3DataProtectionForOrganization',
          action: 'aws:executeAwsApi',
          inputs: {
            Service: 'guardduty',
            Api: 'UpdateOrganizationConfiguration',
            AutoEnable: 'true',
            DetectorId: '{{ GetDetectorId.DetectorId }}',
            DataSources: {
              S3Logs: {
                AutoEnable: 'true',
              },
            },
          },
        }],
      },
    });

    const enableGuardDutyOrganizationsRole = new iam.Role(this, 'EnableGuardDutyOrganizationsRole', {
      assumedBy: new iam.ServicePrincipal('ssm.amazonaws.com'),
      inlinePolicies: {
        EnableAWSServiceAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: [
                'guardduty:EnableOrganizationAdminAccount',
                'guardduty:ListOrganizationAdminAccounts',
                'guardduty:CreateDetector',
                'organizations:EnableAWSServiceAccess',
                'organizations:ListAWSServiceAccessForOrganization',
                'organizations:ListDelegatedAdministrators',
                'organizations:RegisterDelegatedAdministrator',
                'organizations:DescribeOrganization',
                'ssm:DescribeAutomationExecutions',
              ],
              resources: ['*'],
            }),
          ],
        }),
        AllowStartAutomationExecution: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ['ssm:StartAutomationExecution'],
              resources: [
                Arn.format({
                  service: 'ssm',
                  resource: 'automation-definition',
                  resourceName: `${enableGuardDutyExistingAccounts.ref}:*`,
                }, Stack.of(this)),
                Arn.format({
                  service: 'ssm',
                  resource: 'automation-definition',
                  resourceName: `${enableGuardDutyS3DataProtectionForOrganization.ref}:*`,
                }, Stack.of(this)),
              ],
            }),
          ],
        }),
        AllowCallCrossAccountAutomation: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: [
                'sts:AssumeRole',
              ],
              resources: [
                Arn.format({
                  partition: Stack.of(this).partition,
                  service: 'iam',
                  region: '',
                  account: '*',
                  resource: 'role',
                  resourceName: 'AWSControlTowerExecution',
                }),
              ],
            }),
          ],
        }),
        SSMParameters: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ['ssm:GetParameters'],
              resources: [
                Arn.format({
                  service: 'ssm',
                  resource: 'parameter',
                  resourceName: 'superwerker/*',
                }, Stack.of(this)),
              ],
            }),
          ],
        }),
        ServiceLinkedRole: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: [
                'iam:CreateServiceLinkedRole',
              ],
              resources: [
                Arn.format({
                  partition: Stack.of(this).partition,
                  service: 'iam',
                  region: '',
                  account: Stack.of(this).account,
                  resource: 'role',
                  resourceName: 'aws-service-role/guardduty.amazonaws.com/AWSServiceRoleForAmazonGuardDuty',
                }),
              ],
            }),
          ],
        }),
      },
    });

    (enableGuardDutyOrganizationsRole.node.defaultChild as iam.CfnRole).overrideLogicalId('EnableGuardDutyOrganizationsRole');


    const enableGuardDutyOrganizations = new ssm.CfnDocument(this, 'EnableGuardDutyOrganizations', {
      documentType: 'Automation',
      content: {
        schemaVersion: '0.3',
        assumeRole: enableGuardDutyOrganizationsRole.roleArn,
        parameters: {
          AuditAccountId: {
            type: 'String',
            default: '{{ssm:/superwerker/account_id_audit}}',
          },
          LogArchiveAccountId: {
            type: 'String',
            default: '{{ssm:/superwerker/account_id_logarchive}}',
          },
        },
        mainSteps: [{
          name: 'CheckIfOrganizationAdminAccountIsAlReadyRegistered',
          action: 'aws:executeAwsApi',
          inputs: {
            Service: 'guardduty',
            Api: 'ListOrganizationAdminAccounts',
          },
          outputs: [{
            Name: 'AdminAccountId',
            Selector: '$.AdminAccounts[0].AdminAccountId',
          }],
          nextStep: 'EnableOrganizationAdminAccountChoice',
        }, {
          name: 'EnableOrganizationAdminAccountChoice',
          action: 'aws:branch',
          inputs: {
            Choices: [{
              NextStep: 'EnableGuardDutyInManagementAccount',
              Variable: '{{ CheckIfOrganizationAdminAccountIsAlReadyRegistered.AdminAccountId }}',
              StringEquals: '{{ AuditAccountId }}',
            }],
            Default: 'EnableOrganizationAdminAccount',
          },
        }, {
          name: 'EnableOrganizationAdminAccount',
          action: 'aws:executeAwsApi',
          inputs: {
            Service: 'guardduty',
            Api: 'EnableOrganizationAdminAccount',
            AdminAccountId: '{{ AuditAccountId }}',
          },
        }, {
          name: 'WaitForEnableOrganizationAdminAccount',
          timeoutSeconds: '60',
          action: 'aws:waitForAwsResourceProperty',
          inputs: {
            Service: 'organizations',
            Api: 'ListDelegatedAdministrators',
            ServicePrincipal: 'guardduty.amazonaws.com',
            PropertySelector: '$.DelegatedAdministrators[0].Status',
            DesiredValues: [
              'ACTIVE',
            ],
          },
        }, {
          name: 'EnableGuardDutyInManagementAccount',
          action: 'aws:executeAwsApi',
          inputs: {
            Service: 'guardduty',
            Api: 'CreateDetector',
            Enable: 'true',
          },
        }, {
          name: 'SleepEnableGuardDutyExistingAccounts', // GuardDuty Org Admin needs to settle first, give it some time',
          action: 'aws:sleep',
          inputs: {
            Duration: 'PT120S',
          },
        }, {
          name: 'EnableGuardDutyS3DataProtectionForOrganization',
          action: 'aws:executeAwsApi',
          inputs: {
            Service: 'ssm',
            Api: 'StartAutomationExecution',
            DocumentName: enableGuardDutyS3DataProtectionForOrganization.ref,
            TargetLocations: [{
              ExecutionRoleName: 'AWSControlTowerExecution',
              Accounts: [
                '{{ AuditAccountId }}',
              ],
              Regions: [
                Stack.of(this).region,
              ],
            }],
          },
          outputs: [{
            Name: 'AutomationExecutionId',
            Selector: '$.AutomationExecutionId',
          }],
        }, {
          name: 'WaitForEnableGuardDutyS3DataProtectionForOrganization',
          timeoutSeconds: '60',
          action: 'aws:waitForAwsResourceProperty',
          inputs: {
            Service: 'ssm',
            Api: 'DescribeAutomationExecutions',
            Filters: [{
              Key: 'ExecutionId',
              Values: [
                '{{ EnableGuardDutyS3DataProtectionForOrganization.AutomationExecutionId }}',
              ],
            }],
            PropertySelector: '$.AutomationExecutionMetadataList[0].AutomationExecutionStatus',
            DesiredValues: [
              'Success',
            ],
          },
        }, {
          name: 'EnableGuardDutyExistingAccounts',
          action: 'aws:executeAwsApi',
          inputs: {
            Service: 'ssm',
            Api: 'StartAutomationExecution',
            DocumentName: enableGuardDutyExistingAccounts.ref,
            // DocumentName: !Ref EnableGuardDutyExistingAccounts
            TargetLocations: [{
              ExecutionRoleName: 'AWSControlTowerExecution',
              Accounts: [
                '{{ AuditAccountId }}',
              ],
              Regions: [
                Stack.of(this).region,
              ],
            }],
            Parameters: {
              LogArchiveAWSAccountId: [
                '{{ LogArchiveAccountId }}',
              ],
              ManagementAWSAccountId: [
                Stack.of(this).account,
              // !Sub "${AWS::AccountId}"
              ],
            },
          },
          outputs: [{
            Name: 'AutomationExecutionId',
            Selector: '$.AutomationExecutionId',
          }],
        }, {
          name: 'WaitForEnableGuardDutyExistingAccounts',
          timeoutSeconds: '60',
          action: 'aws:waitForAwsResourceProperty',
          inputs: {
            Service: 'ssm',
            Api: 'DescribeAutomationExecutions',
            Filters: [{
              Key: 'ExecutionId',
              Values: [
                '{{ EnableGuardDutyExistingAccounts.AutomationExecutionId }}',
              ],
            }],
            PropertySelector: '$.AutomationExecutionMetadataList[0].AutomationExecutionStatus',
            DesiredValues: [
              'Success',
            ],
          },
        }],
      },
    });

    const ssmAutomationExecutionRoleforCWEvents = new iam.Role(this, 'SSMAutomationExecutionRoleforCWEvents', {
      assumedBy: new iam.ServicePrincipal('events.amazonaws.com'),
      inlinePolicies: {
        AllowStartAutomationExecution: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: [
                'ssm:StartAutomationExecution',
              ],
              resources: [
                Arn.format({
                  service: 'ssm',
                  resource: 'automation-definition',
                  resourceName: `${enableGuardDutyOrganizations.ref}:*`,
                }, Stack.of(this)),
              ],
            }),

          ],
        }),
      },
    });
    (ssmAutomationExecutionRoleforCWEvents.node.defaultChild as iam.CfnRole).overrideLogicalId('SSMAutomationExecutionRoleforCWEvents');


    const landingZoneSetupFinishedTrigger = new events.Rule(this, 'LandingZoneSetupFinishedTrigger', {
      eventPattern: {
        source: [
          'superwerker',
        ],
        detail: {
          eventName: [
            'LandingZoneSetupOrUpdateFinished',
          ],
        },
      },
    });
    (landingZoneSetupFinishedTrigger.node.defaultChild as events.CfnRule).targets = [{
      arn: Arn.format({
        service: 'ssm',
        resource: 'automation-definition',
        resourceName: `${enableGuardDutyOrganizations.ref}`,
      }, Stack.of(this)),
      id: 'EnableGuardDutyOrganizations',
      roleArn: ssmAutomationExecutionRoleforCWEvents.roleArn,
    }];
    (landingZoneSetupFinishedTrigger.node.defaultChild as events.CfnRule).overrideLogicalId('LandingZoneSetupFinishedTrigger');

  }
}
