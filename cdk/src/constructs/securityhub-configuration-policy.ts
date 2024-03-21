import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class SecurityHubConfigurationPolicy extends Construct {
  public readonly id: string;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const RESOURCE_TYPE = 'Custom::SecurityHubConfigurationPolicy';

    const provider = cdk.CustomResourceProvider.getOrCreateProvider(this, RESOURCE_TYPE, {
      codeDirectory: path.join(__dirname, '..', 'functions', 'securityhub-configuration-policy.ts'),
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_18_X,
      timeout: cdk.Duration.seconds(180),
      policyStatements: [
        {
          Sid: 'SecurityHubModifyConfigurationPolicy',
          Effect: 'Allow',
          Action: [
            'securityhub:CreateConfigurationPolicy',
            'securityhub:UpdateConfigurationPolicy',
            'securityhub:DeleteConfigurationPolicy',
            'securityhub:ListConfigurationPolicies',
          ],
          Resource: '*',
        },
      ],
    });

    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: RESOURCE_TYPE,
      serviceToken: provider.serviceToken,
      properties: {
        region: cdk.Stack.of(this).region,
        partition: cdk.Aws.PARTITION,
      },
    });

    this.id = resource.ref;
  }
}
