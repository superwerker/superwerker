import { CfnCondition, CfnParameter, CfnStack, Fn, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { BackupStack } from './backup';
import { BudgetStack } from './budget';
import { ControlTowerStack } from './control-tower';
import { LandingZoneAcceleratorStack } from './landing-zone-accelerator';
import { LivingDocumentationStack } from './living-documentation';
import { NotificationsStack } from './notifications';
import { RootmailStack } from './rootmail';
import { GenerateEmailAddress } from '../constructs/generate-email-address';
import { addParameterToInterface } from '../utils/cfn-interface-parameters';

export interface SuperwerkerStackProps extends StackProps {
  readonly version?: string;
}

export class SuperwerkerStack extends Stack {
  public static AUDIT_ACCOUNT = 'Audit';
  public static LOG_ARCHIVE_ACCOUNT = 'Log Archive';

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

    const includeLZA = new CfnParameter(this, 'LandingzoneAccelerator', {
      type: 'String',
      description:
        'Deploy GitOps Pipeline that rolls out advanced features. REQUIRES creation of Github Token, please see https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/prerequisites.html#create-a-github-personal-access-token-and-store-in-secrets-manager',
      allowedValues: ['Yes', 'No'],
      default: 'Yes',
    });

    const lzaType = new CfnParameter(this, 'LandingzoneAcceleratorType', {
      type: 'String',
      description: 'Inital Landingzone Accelerator (LZA) configuration to roll out',
      allowedValues: ['Superwerker Best Practices'],
      default: 'Superwerker Best Practices',
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

    // Budget
    const budgetStack = new BudgetStack(this, 'BudgetAlarm', {});
    (budgetStack.node.defaultChild as CfnStack).overrideLogicalId('BudgetAlarm');

    // Backup
    const backupStack = new BackupStack(this, 'Backup', {});
    backupStack.addDependency(controlTowerStack);
    (backupStack.node.defaultChild as CfnStack).overrideLogicalId('Backup');

    // // Notifications
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

    /**
     * Advanced Components
     */

    // LandingzoneAccelerator
    const landingzoneAcceleratorCondition = new CfnCondition(this, 'IncludeLandingzoneAcceleratorCondition', {
      expression: Fn.conditionEquals(includeLZA, 'Yes'),
    });
    landingzoneAcceleratorCondition.overrideLogicalId('IncludeLandingzoneAccelerator');
    const landingzoneAcceleratorStack = new LandingZoneAcceleratorStack(this, 'LandingzoneAcceleratorStack', {
      parameters: {
        AuditAWSAccountEmail: emailAudit.email,
        LogArchiveAWSAccountEmail: emailLogArchive.email,
      },
    });
    landingzoneAcceleratorStack.addDependency(controlTowerStack);
    (landingzoneAcceleratorStack.node.defaultChild as CfnStack).overrideLogicalId('LandingzoneAcceleratorStack');
    (landingzoneAcceleratorStack.node.defaultChild as CfnStack).cfnOptions.condition = landingzoneAcceleratorCondition;

    // /**
    //  * labels and groups
    //  */

    const basicLabel = 'Basic Configuration';
    addParameterToInterface({
      groupLabel: basicLabel,
      parameter: domain,
      parameterLabel: 'Domain',
      scope: this,
    }).valueAsString;
    addParameterToInterface({
      groupLabel: basicLabel,
      parameter: subdomain,
      parameterLabel: 'Subdomain',
      scope: this,
    }).valueAsString;
    addParameterToInterface({
      groupLabel: basicLabel,
      parameter: notificationsMail,
      parameterLabel: 'Notifications Mail',
      scope: this,
    }).valueAsString;

    const advancedLabel = 'Advanced Configuration';
    addParameterToInterface({
      groupLabel: advancedLabel,
      parameter: includeLZA,
      parameterLabel: 'Sophisticated: Landingzone Accelerator (LZA)',
      scope: this,
    }).valueAsString;
    addParameterToInterface({
      groupLabel: advancedLabel,
      parameter: lzaType,
      parameterLabel: 'Inital Configuration',
      scope: this,
    }).valueAsString;
  }
}
