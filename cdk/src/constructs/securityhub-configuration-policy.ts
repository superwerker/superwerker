import * as path from 'path';
import { CustomResource, Duration, Stack } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import * as lambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

export interface SecurityHubConfigurationPolicyProps {
  /**
   * Cross Account Role for configuring Security Hub in audit account
   */
  readonly secHubCrossAccountRoleArn: string;
  /**
   * Reference to previous stack for enforcing order of stack creation
   */
  readonly previousRef: string;
}

export class SecurityHubConfigurationPolicy extends Construct {
  public readonly id: string;

  constructor(scope: Construct, id: string, props: SecurityHubConfigurationPolicyProps) {
    super(scope, id);

    const RESOURCE_TYPE = 'Custom::SecurityHubConfigurationPolicy';

    const resource = new CustomResource(this, 'Resource', {
      serviceToken: SecurityHubConfigurationPolicyProvider.getOrCreate(this, props),
      resourceType: RESOURCE_TYPE,
      properties: {
        role: props.secHubCrossAccountRoleArn,
        region: Stack.of(this).region,
        previousRef: props.previousRef,
        newPolicy: '28032024',
      },
    });

    this.id = resource.ref;
  }
}

class SecurityHubConfigurationPolicyProvider extends Construct {
  /**
   * Returns the singleton provider.
   */
  public static getOrCreate(scope: Construct, props: SecurityHubConfigurationPolicyProps) {
    const stack = Stack.of(scope);
    const id = 'superwerker.SecurityHubConfigurationPolicyProvider';
    const x =
      (stack.node.tryFindChild(id) as SecurityHubConfigurationPolicyProvider) ||
      new SecurityHubConfigurationPolicyProvider(stack, id, props);
    return x.provider.serviceToken;
  }

  private readonly provider: cr.Provider;

  constructor(scope: Construct, id: string, props: SecurityHubConfigurationPolicyProps) {
    super(scope, id);

    this.provider = new cr.Provider(this, 'SecurityHubCentralOrganizationConfigurationProvider', {
      onEventHandler: new lambda.NodejsFunction(this, 'SecurityHubCentralOrganizationConfigurationProvider-on-event', {
        entry: path.join(__dirname, '..', 'functions', 'securityhub-configuration-policy.ts'),
        runtime: Runtime.NODEJS_20_X,
        timeout: Duration.seconds(180),
        initialPolicy: [
          new iam.PolicyStatement({
            sid: 'SecurityHubModifyConfiguration',
            actions: [
              'securityhub:CreateConfigurationPolicy',
              'securityhub:UpdateConfigurationPolicy',
              'securityhub:DeleteConfigurationPolicy',
              'securityhub:ListConfigurationPolicies',
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
