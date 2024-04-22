import { CustomResource, Duration, Stack, aws_iam as iam, aws_lambda as lambda, aws_ssm as ssm } from 'aws-cdk-lib';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct, Node } from 'constructs';
import * as path from 'path';
import { PROP_DOMAIN, PROP_PARAM_NAME, PROP_HOSTED_ZONE_ID } from '../functions/workmail-organization.on-event-handler';

export interface WorkmailOrganizationProps {
  readonly domain: string;
  readonly totalTimeToWireDNS?: Duration;
  readonly propagationParameter: ssm.StringParameter;
  readonly hostedZoneId: string;
}

/**
 * Setup Workmail Organization and wait until domain verification is completed
 */

export class WorkmailOrganization extends Construct {
  public workmailOrgId: string;

  constructor(scope: Construct, id: string, props: WorkmailOrganizationProps) {
    super(scope, id);

    const workmailOrg = new CustomResource(this, 'Resource', {
      serviceToken: WorkmailOrganizationProvider.getOrCreate(this, {
        totalTimeToWireDNS: props.totalTimeToWireDNS,
        propagationParam: props.propagationParameter,
      }),
      resourceType: 'Custom::WorkmailOrganization',
      properties: {
        [PROP_DOMAIN]: props.domain,
        [PROP_PARAM_NAME]: props.propagationParameter.parameterName,
        [PROP_HOSTED_ZONE_ID]: props.hostedZoneId,
      },
    });

    this.workmailOrgId = workmailOrg.getAttString('workmailOrgId');
  }
}

interface WorkmailOrganizationProviderProps {
  readonly propagationParam: ssm.StringParameter;
  readonly totalTimeToWireDNS?: Duration;
}

class WorkmailOrganizationProvider extends Construct {
  /**
   * Returns the singleton provider.
   */
  public static getOrCreate(scope: Construct, props: WorkmailOrganizationProviderProps) {
    const stack = Stack.of(scope);
    const id = 'rootmail.workmail-organization-provider';
    const x = (Node.of(stack).tryFindChild(id) as WorkmailOrganizationProvider) || new WorkmailOrganizationProvider(stack, id, props);
    return x.provider.serviceToken;
  }

  private readonly provider: cr.Provider;

  constructor(scope: Construct, id: string, props: WorkmailOrganizationProviderProps) {
    super(scope, id);

    const isCompleteHandlerFunc = new NodejsFunction(this, 'is-complete-handler', {
      entry: path.join(__dirname, '..', 'functions', 'workmail-organization.is-complete-handler.ts'),
      runtime: lambda.Runtime.NODEJS_20_X,
      logRetention: 3,
      timeout: Duration.seconds(30),
    });

    isCompleteHandlerFunc.role!.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonWorkMailFullAccess'));

    isCompleteHandlerFunc.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ssm:PutParameter'],
        effect: iam.Effect.ALLOW,
        resources: [props.propagationParam.parameterArn],
      }),
    );

    const onEventHandlerFunc = new NodejsFunction(this, 'on-event-handler', {
      entry: path.join(__dirname, '..', 'functions', 'workmail-organization.on-event-handler.ts'),
      runtime: lambda.Runtime.NODEJS_20_X,
      logRetention: 3,
      timeout: Duration.seconds(10),
    });

    onEventHandlerFunc.role!.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonWorkMailFullAccess'));

    this.provider = new cr.Provider(this, 'workmail-organization-provider', {
      isCompleteHandler: isCompleteHandlerFunc,
      queryInterval: Duration.seconds(10),
      totalTimeout: Duration.minutes(480),
      onEventHandler: onEventHandlerFunc,
    });
  }
}
