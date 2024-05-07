import * as path from 'path';
import { CustomResource, Duration, Stack } from 'aws-cdk-lib';
import { Rule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import { ServicePrincipal } from 'aws-cdk-lib/aws-iam';
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
}

export class EnableSecurityHub extends Construct {
  public readonly id: string;

  constructor(scope: Construct, id: string, props: EnableSecurityHubProps) {
    super(scope, id);

    const RESOURCE_TYPE = 'Custom::EnableSecurityHub';

    const resource = new CustomResource(this, 'Resource', {
      serviceToken: EnableSecurityHubProvider.getOrCreate(this, props),
      resourceType: RESOURCE_TYPE,
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

    const onEventLambda = new lambda.NodejsFunction(this, 'EnableSecurityHubProvider-on-event', {
      entry: path.join(__dirname, '..', 'functions', 'enable-securityhub.ts'),
      runtime: Runtime.NODEJS_20_X,
      timeout: Duration.seconds(180),
      environment: {
        homeRegion: Stack.of(this).region,
        adminAccountId: props.adminAccountId,
        role: props.secHubCrossAccountRoleArn,
      },
      events: [],
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
        new iam.PolicyStatement({
          sid: 'ControlTowerAccess',
          actions: ['controltower:GetLandingZone', 'controltower:ListLandingZones'],
          resources: ['*'],
        }),
      ],
    });

    // invoke lambda for updating security hub on landing zone changes
    // so that changing the landing zone governed regions updates the security hub linked regions
    const landingzoneUpdateEventRule = new Rule(this, 'LandingzoneUpdateEventRule', {
      eventPattern: {
        source: ['aws.controltower'],
        detailType: ['AWS Service Event via CloudTrail'],
        detail: {
          eventName: ['UpdateLandingZone'],
        },
      },
    });

    landingzoneUpdateEventRule.addTarget(new LambdaFunction(onEventLambda));

    onEventLambda.addPermission('allowEventsInvocation', {
      principal: new ServicePrincipal('events.amazonaws.com'),
      sourceArn: landingzoneUpdateEventRule.ruleArn,
    });

    this.provider = new cr.Provider(this, 'EnableSecurityHubProvider', { onEventHandler: onEventLambda });
  }
}
