import {
  CfnCondition,
  CfnParameter,
  CfnStack,
  Fn,
  Stack,
  StackProps,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { GenerateEmailAddress } from '../constructs/generate-email-address';
import { BudgetStack } from './budget';
import { ControlTowerStack } from './control-tower';
import { GuardDutyStack } from './guardduty';
import { LivingDocumentationStack } from './living-documentation';
import { NotificationsStack } from './notifications';
import { RootmailStack } from './rootmail';
import { SecurityHubStack } from './security-hub';
import { ServiceControlPoliciesStack } from './sevice-control-policies';

export class SuperwerkerStack extends Stack {
  public static AUDIT_ACCOUNT = 'Audit';
  public static LOG_ARCHIVE_ACCOUNT = 'Log Archive';

  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    Stack.of(this).templateOptions.description = 'Automated Best Practices for AWS Cloud setups - https://superwerker.cloud (qs-1rhrhoi4t)';
    Stack.of(this).templateOptions.metadata = {
      SuperwerkerVersion: '0.0.0-DEVELOPMENT',
      QuickStartDocumentation: {
        EntrypointName: 'Parameters for launching Superwerker',
        Order: '1',
      },
    };

    // keep these around so we can still deploy the stack with the same parameters
    new CfnParameter(this, 'QSS3BucketName', { default: '' });
    new CfnParameter(this, 'QSS3BucketRegion', { default: '' });
    new CfnParameter(this, 'QSS3KeyPrefix', { default: '' });

    const domain = new CfnParameter(this, 'Domain', {
      type: 'String',
      description: 'Domain used for root mail feature',
    });

    const subdomain = new CfnParameter(this, 'Subdomain', {
      type: 'String',
      description: 'Subdomain used for root mail feature',
      default: 'aws',
    });

    const notificationsMail = new CfnParameter(this, 'NotificationsMail', {
      type: 'String',
      description: 'Mail address used for notifications',
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

    // RootMail
    const rootMailStack = new RootmailStack(this, 'RootMail', {
      parameters: {
        Domain: domain.value.toString(),
        Subdomain: subdomain.value.toString(),
      },
    });
    (rootMailStack.node.defaultChild as CfnStack).overrideLogicalId('RootMail');

    // ControlTower
    const controlTowerStack = new ControlTowerStack(this, 'ControlTower', {
      parameters: {
        AuditAWSAccountEmail: emailAudit.email,
        LogArchiveAWSAccountEmail: emailLogArchive.email,
      },
    });
    (controlTowerStack.node.defaultChild as CfnStack).overrideLogicalId('ControlTower');

    // LivingDocumentation
    const livingDocumentationStack = new LivingDocumentationStack(this, 'LivingDocumentation', {
      parameters: {
        SuperwerkerDomain: `${subdomain.value.toString()}.${domain.value.toString()}`,
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
    const backupStack = new BudgetStack(this, 'Backup', {});
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

    // ServiceControlPolicies
    const serviceControlPoliciesCondition = new CfnCondition(this, 'IncludeServiceControlPoliciesCondition', {
      expression: Fn.conditionEquals(includeServiceControlPolicies, 'Yes'),
    });
    serviceControlPoliciesCondition.overrideLogicalId('IncludeServiceControlPolicies');
    const serviceControlPoliciesStack = new ServiceControlPoliciesStack(this, 'ServiceControlPolicies', {
      parameters: {
        IncludeSecurityHub: `${Fn.conditionIf('IncludeSecurityHub', 'true', 'false')}`,
        IncludeBackup: `${Fn.conditionIf('IncludeBackup', 'true', 'false')}`,
      },
    });
    serviceControlPoliciesStack.addDependency(controlTowerStack);
    (serviceControlPoliciesStack.node.defaultChild as CfnStack).overrideLogicalId('ServiceControlPolicies');
    (serviceControlPoliciesStack.node.defaultChild as CfnStack).cfnOptions.condition = serviceControlPoliciesCondition;


  }
}
