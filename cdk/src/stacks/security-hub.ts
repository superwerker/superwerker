import { Arn, aws_events as events, aws_iam as iam, aws_ssm as ssm, NestedStack, NestedStackProps, Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';


// ✕ () resource: "EnableSecurityHub" (3 ms)
// ✕ () resource: "EnableSecurityHubInOrgAccountRole" (1 ms)
// ✕ () resource: "EnableSecurityHubInOrgAccount" (1 ms)
// ✕ () resource: "InviteSecurityHubMember" (2 ms)
// ✕ () resource: "AcceptSecurityHubInvitation" (1 ms)
// ✕ () resource: "EnableSecurityHubInOrgAccountAndAddAsMemberRole" (1 ms)
// ✕ () resource: "EnableSecurityHubInOrgAccountAndAddAsMember" (2 ms)
// ✕ () resource: "CreateLandingZoneEnableSecurityHubRole" (5 ms)
// ✕ () resource: "CreateLandingZoneEnableSecurityHub" (1 ms)
// ✓ () resource: "SSMAutomationExecutionRoleforCWEvents"
// ✓ () resource: "LandingZoneSetupFinishedTrigger"
// ✕ () resource: "CreateManagedAccountTrigger" (1 ms)

export class SecurityHubStack extends NestedStack {
  constructor(scope: Construct, id: string, props: NestedStackProps) {
    super(scope, id, props);

    const enableSecurityHubExistingAccounts = new ssm.CfnDocument(this, 'EnableSecurityHubExistingAccounts', {
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
            Service: 'securityhub',
            Api: 'CreateMembers', // NOTE: same API as GD, except DetectorId
            AccountDetails: [
              {
                AccountId: '{{ LogArchiveAWSAccountId }}',
                Email: '{{ LogArchiveAWSAccount.EmailAddress }}',
              },
            ],
            //  Note: not the Mgmt account
            // {
            //   AccountId: '{{ ManagementAWSAccountId }}',
            //   Email: '{{ ManagementAWSAccount.EmailAddress }}',
            // },
          },
        }, {
          name: 'EnableSecurityHubExistingAccounts',
          action: 'aws:executeAwsApi',
          inputs: {
            Service: 'securityhub',
            Api: 'UpdateOrganizationConfiguration',
            AutoEnable: true,
            AutoEnableStandards: 'DEFAULT',
          },
        }],
      },
    });

    const enableSecurityHubOrganizationsRole = new iam.Role(this, 'EnableSecurityHubOrganizationsRole', {
      assumedBy: new iam.ServicePrincipal('ssm.amazonaws.com'),
      inlinePolicies: {
        EnableAWSServiceAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: [
                'securityhub:EnableOrganizationAdminAccount', // Note same permissions from IAM
                'securityhub:ListOrganizationAdminAccounts',
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
                  resourceName: `${enableSecurityHubExistingAccounts.ref}:*`,
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
                  resourceName: 'aws-service-role/securityhub.amazonaws.com/AWSServiceRoleForAmazonSecurityHub',
                }),
              ],
            }),
          ],
        }),
      },
    });

    (enableSecurityHubOrganizationsRole.node.defaultChild as iam.CfnRole).overrideLogicalId('EnableSecurityHubOrganizationsRole');


    const enableSecurityHubOrganization = new ssm.CfnDocument(this, 'EnableSecurityHubOrganizations', {
      documentType: 'Automation',
      content: {
        schemaVersion: '0.3',
        assumeRole: enableSecurityHubOrganizationsRole.roleArn,
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
            Service: 'securityhub',
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
              NextStep: 'EnableSecurityHubInManagementAccount',
              Variable: '{{ CheckIfOrganizationAdminAccountIsAlReadyRegistered.AdminAccountId }}',
              StringEquals: '{{ AuditAccountId }}',
            }],
            Default: 'EnableOrganizationAdminAccount',
          },
        }, {
          name: 'EnableOrganizationAdminAccount',
          action: 'aws:executeAwsApi',
          inputs: {
            Service: 'securityhub',
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
            ServicePrincipal: 'securityhub.amazonaws.com',
            PropertySelector: '$.DelegatedAdministrators[0].Status',
            DesiredValues: [
              'ACTIVE',
            ],
          },
        },
        //  Note: we do not activate it in the Mgmt account
        // {
        //   name: 'EnableSecurityHubInManagementAccount', // which we are running in
        //   action: 'aws:executeAwsApi',
        //   inputs: {
        //     Service: 'securityhub',
        //     Api: 'EnableSecurityHub', // Note in GD it is 'CreateDetector'
        //     EnableDefaultStandards: true, // which is also the default
        //   },
        // },
        {
          name: 'SleepEnableSecurityHubExistingAccounts', // TODO: SecurityHub Org Admin needs to settle first, give it some time', yes?
          action: 'aws:sleep',
          inputs: {
            Duration: 'PT120S',
          },
        }, {
          name: 'EnableSecurityHubExistingAccounts',
          action: 'aws:executeAwsApi',
          inputs: {
            Service: 'ssm',
            Api: 'StartAutomationExecution',
            DocumentName: enableSecurityHubExistingAccounts.ref,
            // DocumentName: !Ref EnableSecurityHubExistingAccounts
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
          name: 'WaitForEnableSecurityHubExistingAccounts',
          timeoutSeconds: '60',
          action: 'aws:waitForAwsResourceProperty',
          inputs: {
            Service: 'ssm',
            Api: 'DescribeAutomationExecutions',
            Filters: [{
              Key: 'ExecutionId',
              Values: [
                '{{ EnableSecurityHubExistingAccounts.AutomationExecutionId }}',
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
                  resourceName: `${enableSecurityHubOrganization.ref}:*`,
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
        resourceName: `${enableSecurityHubOrganization.ref}`,
      }, Stack.of(this)),
      id: 'EnableSecurityHubOrganizations',
      roleArn: ssmAutomationExecutionRoleforCWEvents.roleArn,
    }];
    (landingZoneSetupFinishedTrigger.node.defaultChild as events.CfnRule).overrideLogicalId('LandingZoneSetupFinishedTrigger');

  }
}
