import * as path from 'path';
import { CustomResource, Duration, Stack, aws_iam as iam, aws_lambda as lambda, aws_ssm as ssm } from 'aws-cdk-lib';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct, Node } from 'constructs';
import { PROP_DOMAIN, PROP_PARAM_NAME } from '../functions/hosted-zone-dkim-propagation.on-event-handler';

export interface HostedZoneDKIMPropagationProps {
  readonly domain: string;
  readonly totalTimeToWireDNS?: Duration;
  readonly propagationParameter: ssm.StringParameter;
}

export class HostedZoneDKIMPropagation extends Construct {
  constructor(scope: Construct, id: string, props: HostedZoneDKIMPropagationProps) {
    super(scope, id);

    new CustomResource(this, 'Resource', {
      serviceToken: HostedZoneDKIMPropagationProvider.getOrCreate(this, {
        totalTimeToWireDNS: props.totalTimeToWireDNS,
        propagationParam: props.propagationParameter,
      }),
      resourceType: 'Custom::HostedZoneDKIMPropagation',
      properties: {
        [PROP_DOMAIN]: props.domain,
        [PROP_PARAM_NAME]: props.propagationParameter.parameterName,
      },
    });
  }
}

interface HostedZoneDKIMPropagationProviderProps {
  readonly propagationParam: ssm.StringParameter;
  readonly totalTimeToWireDNS?: Duration;
}

class HostedZoneDKIMPropagationProvider extends Construct {
  /**
   * Returns the singleton provider.
   */
  public static getOrCreate(scope: Construct, props: HostedZoneDKIMPropagationProviderProps) {
    const stack = Stack.of(scope);
    const id = 'rootmail.hosted-zone-dkim-propagation-provider';
    const x =
      (Node.of(stack).tryFindChild(id) as HostedZoneDKIMPropagationProvider) || new HostedZoneDKIMPropagationProvider(stack, id, props);
    return x.provider.serviceToken;
  }

  private readonly provider: cr.Provider;

  constructor(scope: Construct, id: string, props: HostedZoneDKIMPropagationProviderProps) {
    super(scope, id);

    const isCompleteHandlerFunc = new NodejsFunction(this, 'is-complete-handler', {
      entry: path.join(__dirname, '..', 'functions', 'hosted-zone-dkim-propagation.is-complete-handler.ts'),
      runtime: lambda.Runtime.NODEJS_20_X,
      logRetention: 3,
      timeout: Duration.seconds(30),
    });

    isCompleteHandlerFunc.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'ses:GetIdentityVerificationAttributes',
          'ses:GetAccountSendingEnabled',
          'ses:GetIdentityDkimAttributes',
          'ses:GetIdentityNotificationAttributes',
        ],
        effect: iam.Effect.ALLOW,
        resources: ['*'],
      }),
    );

    isCompleteHandlerFunc.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ssm:PutParameter'],
        effect: iam.Effect.ALLOW,
        resources: [props.propagationParam.parameterArn],
      }),
    );

    const onEventHandlerFunc = new NodejsFunction(this, 'on-event-handler', {
      entry: path.join(__dirname, '..', 'functions', 'hosted-zone-dkim-propagation.on-event-handler.ts'),
      runtime: lambda.Runtime.NODEJS_20_X,
      logRetention: 3,
      timeout: Duration.seconds(10),
    });

    this.provider = new cr.Provider(this, 'hosted-zone-dkim-propagation-provider', {
      isCompleteHandler: isCompleteHandlerFunc,
      queryInterval: Duration.seconds(10),
      totalTimeout: props.totalTimeToWireDNS,
      onEventHandler: onEventHandlerFunc,
    });
  }
}
