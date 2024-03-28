import * as path from 'path';
import { CustomResource, Duration, Stack } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import * as lambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

interface EnableSecurityHubProps {
  /**
   * Delegated admin account id
   */
  readonly adminAccountId: string;
  /**
   * Cross Account Role for configuring Security Hub in audit account
   */
  readonly secHubCrossAccountRoleArn: string;
  /**
   * Control Tower enabled regions
   */
  readonly ctGovernedRegions: string[];
}

export class EnableSecurityHub extends Construct {
  public readonly id: string;

  constructor(scope: Construct, id: string, props: EnableSecurityHubProps) {
    super(scope, id);

    const RESOURCE_TYPE = 'Custom::EnableSecurityHub';

    const resource = new CustomResource(this, 'Resource', {
      serviceToken: EnableSecurityHubProvider.getOrCreate(this, props),
      resourceType: RESOURCE_TYPE,
      properties: {
        region: Stack.of(this).region,
        adminAccountId: props.adminAccountId,
        role: props.secHubCrossAccountRoleArn,
        ctGovernedRegions: props.ctGovernedRegions,
      },
    });

    this.id = resource.ref;
  }
}

class EnableSecurityHubProvider extends Construct {
  /**
   * Returns the singleton provider.
   */
  public static getOrCreate(scope: Construct, props: EnableSecurityHubProps) {
    const stack = Stack.of(scope);
    const id = 'superwerker.EnableSecurityHubProvider';
    const x = (stack.node.tryFindChild(id) as EnableSecurityHubProvider) || new EnableSecurityHubProvider(stack, id, props);
    return x.provider.serviceToken;
  }

  private readonly provider: cr.Provider;

  constructor(scope: Construct, id: string, props: EnableSecurityHubProps) {
    super(scope, id);

    this.provider = new cr.Provider(this, 'EnableSecurityHubProvider', {
      onEventHandler: new lambda.NodejsFunction(this, 'EnableSecurityHubProvider-on-event', {
        entry: path.join(__dirname, '..', 'functions', 'enable-securityhub.ts'),
        runtime: Runtime.NODEJS_20_X,
        timeout: Duration.seconds(180),
        initialPolicy: [
          new iam.PolicyStatement({
            sid: 'SecurityHubEnableOrganizationAdminTaskOrganizationActions',
            actions: ['organizations:DescribeOrganization', 'organizations:ListAccounts', 'organizations:ListDelegatedAdministrators'],
            resources: ['*'],
          }),
          new iam.PolicyStatement({
            actions: ['organizations:EnableAWSServiceAccess'],
            resources: ['*'],
            conditions: {
              StringEquals: {
                'organizations:ServicePrincipal': 'securityhub.amazonaws.com',
              },
            },
          }),
          new iam.PolicyStatement({
            actions: ['organizations:RegisterDelegatedAdministrator', 'organizations:DeregisterDelegatedAdministrator'],
            resources: [`arn:${Stack.of(this).partition}:organizations::*:account/o-*/*`],
            conditions: {
              StringEquals: {
                'organizations:ServicePrincipal': 'securityhub.amazonaws.com',
              },
            },
          }),
          new iam.PolicyStatement({
            sid: 'SecurityHubCreateMembersTaskIamAction',
            actions: ['iam:CreateServiceLinkedRole'],
            resources: ['*'],
            conditions: {
              StringEquals: {
                'iam:AWSServiceName': 'securityhub.amazonaws.com',
              },
            },
          }),
          new iam.PolicyStatement({
            sid: 'EnableSecurityHub',
            actions: ['securityhub:*'],
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
