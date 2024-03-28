import * as path from 'path';
import { CustomResource, Duration, Stack } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import * as lambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

export interface SecurityHubConfigurationPolicyAssociationProps {
  /**
   * Cross Account Role for configuring Security Hub in audit account
   */
  readonly secHubCrossAccountRoleArn: string;
  /**
   * Reference to previous stack for enforcing order of stack creation
   */
  readonly previousRef: string;
}

export class SecurityHubConfigurationPolicyAssociation extends Construct {
  public readonly id: string;

  constructor(scope: Construct, id: string, props: SecurityHubConfigurationPolicyAssociationProps) {
    super(scope, id);

    const RESOURCE_TYPE = 'Custom::SecurityHubConfigurationPolicyAssociation';

    const resource = new CustomResource(this, 'Resource', {
      serviceToken: SecurityHubConfigurationPolicyAssociationProvider.getOrCreate(this, props),
      resourceType: RESOURCE_TYPE,
      properties: {
        role: props.secHubCrossAccountRoleArn,
        previousRef: props.previousRef,
      },
    });

    this.id = resource.ref;
  }
}

class SecurityHubConfigurationPolicyAssociationProvider extends Construct {
  /**
   * Returns the singleton provider.
   */
  public static getOrCreate(scope: Construct, props: SecurityHubConfigurationPolicyAssociationProps) {
    const stack = Stack.of(scope);
    const id = 'superwerker.SecurityHubConfigurationPolicyAssociationProvider';
    const x =
      (stack.node.tryFindChild(id) as SecurityHubConfigurationPolicyAssociationProvider) ||
      new SecurityHubConfigurationPolicyAssociationProvider(stack, id, props);
    return x.provider.serviceToken;
  }

  private readonly provider: cr.Provider;

  constructor(scope: Construct, id: string, props: SecurityHubConfigurationPolicyAssociationProps) {
    super(scope, id);

    this.provider = new cr.Provider(this, 'SecurityHubCentralOrganizationConfigurationProvider', {
      onEventHandler: new lambda.NodejsFunction(this, 'SecurityHubCentralOrganizationConfigurationProvider-on-event', {
        entry: path.join(__dirname, '..', 'functions', 'securityhub-configuration-policy-association.ts'),
        runtime: Runtime.NODEJS_20_X,
        timeout: Duration.seconds(180),
        initialPolicy: [
          new iam.PolicyStatement({
            sid: 'SecurityHubModifyConfiguration',
            actions: [
              'securityhub:ListConfigurationPolicies',
              'securityhub:StartConfigurationPolicyAssociation',
              'securityhub:StartConfigurationPolicyDisassociation',
            ],
            resources: ['*'],
          }),
          new iam.PolicyStatement({
            sid: 'SecurityHubConfiguration',
            actions: ['sts:AssumeRole'],
            resources: [props.secHubCrossAccountRoleArn],
          }),
        ],
      }),
    });
  }
}
