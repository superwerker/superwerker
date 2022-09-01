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

    // @ts-ignore
    const quickstartS3BucketName = new CfnParameter(this, 'QSS3BucketName', {
      type: 'String',
      description: 'Name of the S3 bucket for your copy of the Quick Start assets. Keep the default name unless you are customizing the template. Changing the name updates code references to point to a new Quick Start location. This name can include numbers, lowercase letters, uppercase letters, and hyphens, but do not start or end with a hyphen (-). See https://aws-quickstart.github.io/option1.html.',
      allowedValues: ['Yes', 'No'],
      default: 'aws-quickstart',
      allowedPattern: '^[0-9a-zA-Z]+([0-9a-zA-Z-]*[0-9a-zA-Z])*$',
      constraintDescription: 'The Quick Start bucket name can include numbers, lowercase letters, uppercase letters, and hyphens (-). It cannot start or end with a hyphen (-).',
    });

    // @ts-ignore
    const quickstartS3BucketRegion = new CfnParameter(this, 'QSS3BucketRegion', {
      type: 'String',
      description: 'AWS Region where the Quick Start S3 bucket (QSS3BucketName) is hosted. Keep the default Region unless you are customizing the template. Changing this Region updates code references to point to a new Quick Start location. When using your own bucket, specify the Region. See https://aws-quickstart.github.io/option1.html.',
      default: 'us-east-1',
    });

    // @ts-ignore
    const quickstartS3KeyPrefix = new CfnParameter(this, 'QSS3KeyPrefix', {
      type: 'String',
      description: 'S3 key prefix that is used to simulate a directory for your copy of the Quick Start assets. Keep the default prefix unless you are customizing the template. Changing this prefix updates code references to point to a new Quick Start location. This prefix can include numbers, lowercase letters, uppercase letters, hyphens (-), colon (:), and forward slashes (/). See https://docs.aws.amazon.com/AmazonS3/latest/dev/UsingMetadata.html and https://aws-quickstart.github.io/option1.html.',
      default: 'quickstart-superwerker/',
      allowedPattern: '^([0-9a-zA-Z-.:]+/)*$',
      constraintDescription: 'The Quick Start S3 key prefix can include numbers, lowercase letters, uppercase letters, hyphens (-), colon (:), and forward slashes (/).',
    });

  }
}