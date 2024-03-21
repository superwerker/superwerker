import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class SecurityHubConfigurationPolicyAssociation extends Construct {
  public readonly id: string;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const RESOURCE_TYPE = 'Custom::SecurityHubConfigurationPolicyAssociation';

    const provider = cdk.CustomResourceProvider.getOrCreateProvider(this, RESOURCE_TYPE, {
      codeDirectory: path.join(__dirname, '..', 'functions', 'securityhub-configuration-policy-association.ts'),
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_18_X,
      timeout: cdk.Duration.seconds(180),
      policyStatements: [
        {
          Sid: 'SecurityHubConfigurationPolicyAssociationOrganizationActions',
          Effect: 'Allow',
          Action: ['organizations:ListRoots'],
          Resource: '*',
        },
        {
          Sid: 'SecurityHubModifyConfigurationAssociationPolicy',
          Effect: 'Allow',
          Action: [
            'securityhub:ListConfigurationPolicyAssociations',
            'securityhub:StartConfigurationPolicyAssociation',
            'securityhub:StartConfigurationPolicyDisassociation',
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
