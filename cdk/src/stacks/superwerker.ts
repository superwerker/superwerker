import { CfnCondition, CfnParameter, CfnStack, Fn, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { BackupStack } from './backup';
import { BillingStack } from './billing';
import { BudgetStack } from './budget';
import { ControlTowerStack } from './control-tower';
import { GuardDutyStack } from './guardduty';
import { LivingDocumentationStack } from './living-documentation';
import { NotificationsStack } from './notifications';
import { PrepareStack } from './prepare';
import { RootmailStack } from './rootmail';
import { SecurityHubStack } from './security-hub';
import { ServiceControlPoliciesStack } from './sevice-control-policies';
import { GenerateEmailAddress } from '../constructs/generate-email-address';

export interface SuperwerkerStackProps extends StackProps {
  readonly version?: string;
}

export class SuperwerkerStack extends Stack {
  public static AUDIT_ACCOUNT = 'Audit';
  public static LOG_ARCHIVE_ACCOUNT = 'Log Archive';
  public static HOSTEDZONE_PARAM_NAME = '/superwerker/domain_name_servers';
  public static PROPAGATION_PARAM_NAME = '/superwerker/propagation_status';

  constructor(scope: Construct, id: string, props: SuperwerkerStackProps) {
    super(scope, id, props);

    Stack.of(this).templateOptions.description = 'Automated Best Practices for AWS Cloud setups - https://superwerker.cloud (qs-1rhrhoi4t)';
    Stack.of(this).templateOptions.metadata = {
      SuperwerkerVersion: props.version,
      QuickStartDocumentation: {
        EntrypointName: 'Parameters for launching Superwerker',
        Order: '1',
      },
    };

    const domain = new CfnParameter(this, 'Domain', {
      type: 'String',
      description:
        'Domain used for root mail feature. Please see https://github.com/superwerker/superwerker/blob/main/README.md#technical-faq for more information',
    });

    const subdomain = new CfnParameter(this, 'Subdomain', {
      type: 'String',
      description:
        'Subdomain used for root mail feature. Please see https://github.com/superwerker/superwerker/blob/main/README.md#technical-faq for more information',
      default: 'aws',
    });

    const notificationsMail = new CfnParameter(this, 'NotificationsMail', {
      type: 'String',
      description:
        'Mail address used for notifications. Please see https://github.com/superwerker/superwerker/blob/main/README.md#technical-faq for more information',
      default: '',
      allowedPattern: '(^$|^.*@.*\\..*$)',
    });

    const includeBudget = new CfnParameter(this, 'IncludeBudget', {
      type: 'String',
      description: 'Enable AWS Budgets alarm for monthly AWS spending',
      allowedValues: ['Yes', 'No'],
      default: 'Yes',
    });

    const includeGuardDuty = new CfnParameter(this, 'IncludeGuardDuty', {
      type: 'String',
      description: 'Enable Amazon GuardDuty',
      allowedValues: ['Yes', 'No'],
      default: 'Yes',
    });

    const includeSecurityHub = new CfnParameter(this, 'IncludeSecurityHub', {
      type: 'String',
      description: 'Enable AWS Security Hub',
      allowedValues: ['Yes', 'No'],
      default: 'Yes',
    });

    const includeBackup = new CfnParameter(this, 'IncludeBackup', {
      type: 'String',
      description: 'Enable automated backups',
      allowedValues: ['Yes', 'No'],
      default: 'Yes',
    });

    const includeServiceControlPolicies = new CfnParameter(this, 'IncludeServiceControlPolicies', {
      type: 'String',
      description: 'Enable service control policies in AWS organizations',
      allowedValues: ['Yes', 'No'],
      default: 'Yes',
    });

    /**
     * Core Components
     */
    const emailAudit = new GenerateEmailAddress(this, 'GeneratedAuditAWSAccountEmail', {
      domain: `${subdomain.value}.${domain.value}`,
      name: `${SuperwerkerStack.AUDIT_ACCOUNT}`,
    });

    const emailLogArchive = new GenerateEmailAddress(this, 'GeneratedLogArchiveAWSAccountEmail', {
      domain: `${subdomain.value}.${domain.value}`,
      name: `${SuperwerkerStack.LOG_ARCHIVE_ACCOUNT}`,
    });

    // Prepare
    const prepareStack = new PrepareStack(this, 'Prepare', {
      description: 'Prepares the AWS account for Superwerker.',
    });
    (prepareStack.node.defaultChild as CfnStack).overrideLogicalId('Prepare');

    // RootMail
    const rootMailStack = new RootmailStack(this, 'RootMail', {
      parameters: {
        Domain: domain.valueAsString,
        Subdomain: subdomain.valueAsString,
        PropagationParameterName: SuperwerkerStack.PROPAGATION_PARAM_NAME,
        HostedZoneParameterName: SuperwerkerStack.HOSTEDZONE_PARAM_NAME,
      },
    });
    (rootMailStack.node.defaultChild as CfnStack).overrideLogicalId('RootMail');

    // ControlTower
    const controlTowerStack = new ControlTowerStack(this, 'ControlTower', {
      parameters: {
        AuditAWSAccountEmail: emailAudit.email,
        LogArchiveAWSAccountEmail: emailLogArchive.email,
      },
      description: 'Sets up the landing zone with control tower.',
    });
    (controlTowerStack.node.defaultChild as CfnStack).overrideLogicalId('ControlTower');
    controlTowerStack.addDependency(prepareStack);

    // LivingDocumentation
    const livingDocumentationStack = new LivingDocumentationStack(this, 'LivingDocumentation', {
      parameters: {
        SuperwerkerDomain: `${subdomain.value.toString()}.${domain.value.toString()}`,
        PropagationParamName: SuperwerkerStack.PROPAGATION_PARAM_NAME,
        HostedZoneParamName: SuperwerkerStack.HOSTEDZONE_PARAM_NAME,
      },
    });
    (livingDocumentationStack.node.defaultChild as CfnStack).overrideLogicalId('LivingDocumentation');

    /**
     * optional components
     */

    // Backup
    const backupCondition = new CfnCondition(this, 'IncludeBackupCondition', {
      expression: Fn.conditionEquals(includeBackup, 'Yes'),
    });
    backupCondition.overrideLogicalId('IncludeBackup');
    const backupStack = new BackupStack(this, 'Backup', {
      description: 'Sets up backup configuration and policies.',
    });
    backupStack.addDependency(controlTowerStack);
    (backupStack.node.defaultChild as CfnStack).overrideLogicalId('Backup');
    (backupStack.node.defaultChild as CfnStack).cfnOptions.condition = backupCondition;

    // Budgets
    const budgetCondition = new CfnCondition(this, 'IncludeBudgetCondition', {
      expression: Fn.conditionEquals(includeBudget, 'Yes'),
    });
    budgetCondition.overrideLogicalId('IncludeBudget');
    const budgetStack = new BudgetStack(this, 'Budget', {});
    (budgetStack.node.defaultChild as CfnStack).overrideLogicalId('Budget');
    (budgetStack.node.defaultChild as CfnStack).cfnOptions.condition = budgetCondition;

    // GuardDuty
    const guardDutyCondition = new CfnCondition(this, 'IncludeGuardDutyCondition', {
      expression: Fn.conditionEquals(includeGuardDuty, 'Yes'),
    });
    guardDutyCondition.overrideLogicalId('IncludeGuardDuty');
    const guardDutyStack = new GuardDutyStack(this, 'GuardDuty', {});
    (guardDutyStack.node.defaultChild as CfnStack).overrideLogicalId('GuardDuty');
    (guardDutyStack.node.defaultChild as CfnStack).cfnOptions.condition = guardDutyCondition;

    // Notifications
    const notificationsCondition = new CfnCondition(this, 'IncludeNotificationsCondition', {
      expression: Fn.conditionNot(Fn.conditionEquals(notificationsMail, '')),
    });
    notificationsCondition.overrideLogicalId('IncludeNotifications');
    const notificationsStack = new NotificationsStack(this, 'Notifications', {
      parameters: {
        NotificationsMail: notificationsMail.value.toString(),
      },
    });
    notificationsStack.addDependency(rootMailStack);
    (notificationsStack.node.defaultChild as CfnStack).overrideLogicalId('Notifications');
    (notificationsStack.node.defaultChild as CfnStack).cfnOptions.condition = notificationsCondition;

    // SecurityHub
    const securityHubCondition = new CfnCondition(this, 'IncludeSecurityHubCondition', {
      expression: Fn.conditionEquals(includeSecurityHub, 'Yes'),
    });
    securityHubCondition.overrideLogicalId('IncludeSecurityHub');
    const securityHubStack = new SecurityHubStack(this, 'SecurityHub', {});
    (securityHubStack.node.defaultChild as CfnStack).overrideLogicalId('SecurityHub');
    (securityHubStack.node.defaultChild as CfnStack).cfnOptions.condition = securityHubCondition;
    securityHubStack.addDependency(controlTowerStack);

    // ServiceControlPolicies
    const serviceControlPoliciesCondition = new CfnCondition(this, 'IncludeServiceControlPoliciesCondition', {
      expression: Fn.conditionEquals(includeServiceControlPolicies, 'Yes'),
    });
    serviceControlPoliciesCondition.overrideLogicalId('IncludeServiceControlPolicies');
    const serviceControlPoliciesStack = new ServiceControlPoliciesStack(this, 'ServiceControlPolicies', {
      parameters: {
        IncludeBackup: includeBackup.value.toString(),
      },
    });
    serviceControlPoliciesStack.addDependency(controlTowerStack);
    (serviceControlPoliciesStack.node.defaultChild as CfnStack).overrideLogicalId('ServiceControlPolicies');
    (serviceControlPoliciesStack.node.defaultChild as CfnStack).cfnOptions.condition = serviceControlPoliciesCondition;

    // Billing
    const billingStack = new BillingStack(this, 'Billing', {});
    billingStack.addDependency(controlTowerStack);
    (billingStack.node.defaultChild as CfnStack).overrideLogicalId('Billing');
  }
}
