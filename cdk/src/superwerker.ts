import { CfnCondition, CfnParameter, CfnStack, Fn, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { BudgetStack } from './budget';

export class SuperwerkerStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    Stack.of(this).templateOptions.description = 'Automated Best Practices for AWS Cloud setups - https://superwerker.cloud (qs-1rhrhoi4t)';
    Stack.of(this).templateOptions.metadata = {
      SuperwerkerVersion: '0.0.0-DEVELOPMENT',
      QuickStartDocumentation:
          {
            EntrypointName: 'Parameters for launching Superwerker',
            Order: '1',
          },
    };

    // @ts-ignore
    const domain = new CfnParameter(this, 'Domain', {
      type: 'String',
      description: 'Domain used for root mail feature',
    });

    // @ts-ignore
    const subdomain = new CfnParameter(this, 'Subdomain', {
      type: 'String',
      description: 'Subdomain used for root mail feature',
      default: 'aws',
    });

    // @ts-ignore
    const notificationsMail = new CfnParameter(this, 'NotificationsMail', {
      type: 'String',
      description: 'Mail address used for notifications',
      default: '',
      allowedPattern: '(^$|^.*@.*\\..*$)',
    });

    // @ts-ignore
    const includeBudget = new CfnParameter(this, 'IncludeBudget', {
      type: 'String',
      description: 'Enable AWS Budgets alarm for monthly AWS spending',
      allowedValues: ['Yes', 'No'],
      default: 'Yes',
    });

    // @ts-ignore
    const includeGuardDuty = new CfnParameter(this, 'IncludeGuardDuty', {
      type: 'String',
      description: 'Enable Amazon GuardDuty',
      allowedValues: ['Yes', 'No'],
      default: 'Yes',
    });

    // @ts-ignore
    const includeSecurityHub = new CfnParameter(this, 'IncludeSecurityHub', {
      type: 'String',
      description: 'Enable AWS Security Hub',
      allowedValues: ['Yes', 'No'],
      default: 'Yes',
    });

    // @ts-ignore
    const includeBackup = new CfnParameter(this, 'IncludeBackup', {
      type: 'String',
      description: 'Enable automated backups',
      allowedValues: ['Yes', 'No'],
      default: 'Yes',
    });

    // @ts-ignore
    const includeServiceControlPolicies = new CfnParameter(this, 'IncludeServiceControlPolicies', {
      type: 'String',
      description: 'Enable service control policies in AWS organizations',
      allowedValues: ['Yes', 'No'],
      default: 'Yes',
    });

    const budgetCondition = new CfnCondition(this, 'IncludeBudgetCondition', {
      expression: Fn.conditionEquals(includeBudget, 'Yes'),
    });
    budgetCondition.overrideLogicalId('IncludeBudget');
    const budgetStack = new BudgetStack(this, 'Budget', {});
    (budgetStack.node.defaultChild as CfnStack).overrideLogicalId('Budget');
    (budgetStack.node.defaultChild as CfnStack).cfnOptions.condition = budgetCondition;

  }
}