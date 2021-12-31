import {Stack, StackProps} from 'aws-cdk-lib';
import {Construct} from 'constructs';
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as iam from 'aws-cdk-lib/aws-iam';

interface SsmStep {
    name: string;
    action: string;
    timeoutSeconds?: number;
    maxAttempts?: number;
    inputs: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    outputs?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    nextStep?: string;
}

interface SsmDocument {
    assumeRole?: string;
    schemaVersion: '0.3';
    outputs?: string[];
    parameters?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    mainSteps: SsmStep[];
}

export class SuperwerkerSecurityHubStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        const enableSHOrganizationsExistingAccountsDocument: SsmDocument = {
            schemaVersion: '0.3',
            parameters: {
                LogArchiveAWSAccountId: {
                    type: 'String',
                },
                ManagementAWSAccountId: {
                    type: 'String',
                },
            },
            mainSteps: [
                {
                    name: 'CheckIfOrganizationAdminAccountIsAlReadyRegistered',
                    action: 'aws:executeAwsApi',
                    inputs: {
                        Service: 'securityhub',
                        Api: 'ListOrganizationAdminAccounts',
                    },
                    outputs: [
                        {
                            Name: 'AdminAccountId',
                            Selector: '$.AdminAccounts[0].AdminAccountId'
                        },
                    ],
                    nextStep: 'EnableOrganizationAdminAccountChoice',
                },

            ],
        };

        const enableSHOrganizationsExistingAccounts = new ssm.CfnDocument(this, 'EnableSHOrganizations', {
            content: enableSHOrganizationsExistingAccountsDocument,
            documentType: 'Automation',
        });

        const enableSHOrganizationsExistingAccountsArn = this.formatArn({
            service: 'ssm',
            resource: 'automation-definition',
            resourceName: enableSHOrganizationsExistingAccounts.ref,
        });

        const awsControlTowerExecutionRoleArn = this.formatArn({
            service: 'iam',
            resource: 'role',
            resourceName: 'AWSControlTowerExecution',
            region: '',
            account: '*',
        });

        const enableGuardDutyOrganizationsRole = new iam.Role(this, 'EnableGuardDutyOrganizationsRole', {
            assumedBy: new iam.ServicePrincipal('ssm.amazonaws.com'),
            inlinePolicies: {
                'EnableGuardDutyOrganizationsRole': new iam.PolicyDocument({
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
                        new iam.PolicyStatement({
                            actions: [
                                'ssm:StartAutomationExecution',
                            ],
                            resources: [enableSHOrganizationsExistingAccountsArn + ':*'],
                        }),
                        new iam.PolicyStatement({
                            actions: [
                                'sts:AssumeRole',
                            ],
                            resources: [awsControlTowerExecutionRoleArn],
                        }),
                        new iam.PolicyStatement({
                            actions: [
                                'ssm:GetParameters',
                            ],
                            resources: [this.formatArn({
                                service: 'ssm',
                                resource: 'parameter',
                                resourceName: 'superwerker/*'
                            })],
                        }),
                        new iam.PolicyStatement({
                            actions: [
                                'iam:CreateServiceLinkedRole',
                            ],
                            resources: [this.formatArn({
                                service: 'iam',
                                resource: 'role',
                                resourceName: '/aws-service-role/guardduty.amazonaws.com/AWSServiceRoleForAmazonGuardDuty',
                                region: '',
                            })],
                        }),
                    ],
                }),
            },
        });

        const enableSHOrganizationsDocumentContent: SsmDocument = {
            schemaVersion: '0.3',
            assumeRole: enableGuardDutyOrganizationsRole.roleArn,
            parameters: {
                AuditAccountId: {
                    type: 'String',
                    default: '{{ssm:/superwerker/account_id_audit}}'
                },
                LogArchiveAccountId: {
                    type: 'String',
                    default: '{{ssm:/superwerker/account_id_logarchive}}'
                },
            },
            mainSteps: [
                {
                    name: 'CheckIfOrganizationAdminAccountIsAlReadyRegistered',
                    action: 'aws:executeAwsApi',
                    inputs: {
                        Service: 'securityhub',
                        Api: 'ListOrganizationAdminAccounts',
                    },
                    outputs: [
                        {
                            Name: 'AdminAccountId',
                            Selector: '$.AdminAccounts[0].AdminAccountId'
                        },
                    ],
                    nextStep: 'EnableOrganizationAdminAccountChoice',
                },
                {
                    name: 'EnableOrganizationAdminAccountChoice',
                    action: 'aws:branch',
                    inputs: {
                        Choices: [
                            {
                                NextStep: 'EnableGuardDutyInManagementAccount',
                                Variable: '{{ CheckIfOrganizationAdminAccountIsAlReadyRegistered.AdminAccountId }}',
                                StringEquals: '{{ AuditAccountId }}',
                            }
                        ],
                        Default: 'EnableOrganizationAdminAccount',
                    },
                },
                {
                    name: 'EnableOrganizationAdminAccount',
                    action: 'aws:executeAwsApi',
                    inputs: {
                        Service: 'securityhub',
                        Api: 'EnableOrganizationAdminAccount',
                        AdminAccountId: '{{ AuditAccountId }}',
                    },
                },
                {
                    name: 'WaitForEnableOrganizationAdminAccount',
                    timeoutSeconds: 60,
                    action: 'aws:waitForAwsResourceProperty',
                    inputs: {
                        Service: 'organizations',
                        Api: 'ListDelegatedAdministrators',
                        ServicePrincipal: 'securityhub.amazonaws.com',
                        PropertySelector: '$.DelegatedAdministrators[0].Status',
                        DesiredValues: ['ACTIVE'],
                    },
                },
                {
                    name: 'EnableGuardDutyExistingAccounts',
                    action: 'aws:executeAwsApi',
                    inputs: {
                        Service: 'ssm',
                        Api: 'StartAutomationExecution',
                        DocumentName: enableSHOrganizationsExistingAccounts.ref,
                        TargetLocations: [
                            {
                                ExecutionRoleName: 'AWSControlTowerExecution',
                                Accounts: [
                                    '{{ AuditAccountId }}',
                                ],
                                Regions: [
                                    this.region,
                                ]
                            },
                        ],
                        Parameters: {
                            'ManagementAWSAccountId': [this.account],
                            'LogArchiveAWSAccountId': ['{{ LogArchiveAccountId }}'],
                        },
                    },
                    outputs: [
                        {
                            Name: 'AutomationExecutionId',
                            Selector: '$.AutomationExecutionId'
                        },
                    ],
                },
                {
                    name: 'WaitForEnableGuardDutyExistingAccounts',
                    timeoutSeconds: 60,
                    action: 'aws:waitForAwsResourceProperty',
                    inputs: {
                        Service: 'ssm',
                        Api: 'DescribeAutomationExecutions',
                        Filters: [
                            {
                                Key: 'ExecutionId',
                                Values: ['{{ EnableGuardDutyExistingAccounts.AutomationExecutionId }}'],
                            },
                        ],
                        PropertySelector: '$.AutomationExecutionMetadataList[0].AutomationExecutionStatus',
                        DesiredValues: ['Success'],
                    },
                },
            ],
        };

        const EnableSHOrganizations = new ssm.CfnDocument(this, 'EnableSHOrganizations', {
            content: enableSHOrganizationsDocumentContent,
            documentType: 'Automation',
        });

        const enableSHOrganizationsArn = this.formatArn({
            service: 'ssm',
            resource: 'automation-definition',
            resourceName: EnableSHOrganizations.ref,
        });

        const ssmAutomationExecutionRoleforCWEvents = new iam.Role(this, 'SSMAutomationExecutionRoleforCWEvents', {
            assumedBy: new iam.ServicePrincipal('events.amazonaws.com'),
            inlinePolicies: {
                'AllowStartAutomationExecution': new iam.PolicyDocument({
                    statements: [
                        new iam.PolicyStatement({
                            actions: ['ssm:StartAutomationExecution'],
                            resources: [enableSHOrganizationsArn + ':*'],
                        }),
                    ],
                }),
            },
        });

        const enableSHOrganizationsTrigger = new events.CfnRule(this, 'EnableSHOrganizationsTrigger', {
            eventPattern: {
                source: ['superwerker'],
                detailType: ['CloudWatch Alarm State Change'],
                detail: {
                    'eventName': ['LandingZoneSetupOrUpdateFinished'],
                },
            },
            targets: [
                {
                    arn: enableSHOrganizationsArn,
                    id: 'EnableSHOrganizations',
                    roleArn: ssmAutomationExecutionRoleforCWEvents.roleArn,
                },
            ],
        });


    }
}
