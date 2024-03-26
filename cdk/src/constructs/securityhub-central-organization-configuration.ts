import * as path from 'path';
import { CustomResource, Duration, Stack } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import * as lambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

export interface SecurityHubCentralOrganizationConfigurationProps {
  /**
   * Cross Account Role for configuring Security Hub in audit account
   */
  readonly secHubCrossAccountRoleArn: string;
  /**
   * Security Hub region aggregation reference
   */
  readonly secHubRegionAggregationRef: string;
}

export class SecurityHubCentralOrganizationConfiguration extends Construct {
  public readonly id: string;

  constructor(scope: Construct, id: string, props: SecurityHubCentralOrganizationConfigurationProps) {
    super(scope, id);

    const RESOURCE_TYPE = 'Custom::SecurityHubCentralOrganizationConfiguration';

    const resource = new CustomResource(this, 'Resource', {
      serviceToken: SecurityHubCentralOrganizationConfigurationProvider.getOrCreate(this, props),
      resourceType: RESOURCE_TYPE,
      properties: {
        role: props.secHubCrossAccountRoleArn,
        secHubRegionAggregationRef: props.secHubRegionAggregationRef,
      },
    });

    this.id = resource.ref;
  }
}

class SecurityHubCentralOrganizationConfigurationProvider extends Construct {
  /**
   * Returns the singleton provider.
   */
  public static getOrCreate(scope: Construct, props: SecurityHubCentralOrganizationConfigurationProps) {
    const stack = Stack.of(scope);
    const id = 'superwerker.SecurityHubCentralOrganizationConfigurationProvider';
    const x =
      (stack.node.tryFindChild(id) as SecurityHubCentralOrganizationConfigurationProvider) ||
      new SecurityHubCentralOrganizationConfigurationProvider(stack, id, props);
    return x.provider.serviceToken;
  }

  private readonly provider: cr.Provider;

  constructor(scope: Construct, id: string, props: SecurityHubCentralOrganizationConfigurationProps) {
    super(scope, id);

    this.provider = new cr.Provider(this, 'SecurityHubCentralOrganizationConfigurationProvider', {
      onEventHandler: new lambda.NodejsFunction(this, 'SecurityHubCentralOrganizationConfigurationProvider-on-event', {
        entry: path.join(__dirname, '..', 'functions', 'securityhub-central-organization-configuration.ts'),
        runtime: Runtime.NODEJS_20_X,
        timeout: Duration.seconds(180),
        initialPolicy: [
          new iam.PolicyStatement({
            sid: 'SecurityHubConfigurationOrganizationActions',
            actions: ['organizations:ListRoots'],
            resources: ['*'],
          }),
          new iam.PolicyStatement({
            sid: 'SecurityHubModifyConfiguration',
            actions: [
              'securityhub:ListConfigurationPolicyAssociations',
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
