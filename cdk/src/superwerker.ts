import { CfnParameter, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class SuperwerkerStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    // new CfnInclude(this, 'SuperwerkerTemplate', {
    //   templateFile: path.join(__dirname, '..', 'templates', 'superwerker.template.yaml'),
    // });

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
  }
}