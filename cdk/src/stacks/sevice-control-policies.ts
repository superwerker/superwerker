import * as path from 'path';
import { CfnParameter, CfnResource, CustomResource, Duration, NestedStack, NestedStackProps, Stack } from 'aws-cdk-lib';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

export class ServiceControlPoliciesStack extends NestedStack {
  constructor(scope: Construct, id: string, props: NestedStackProps) {
    super(scope, id, props);

    const includeBackup = new CfnParameter(this, 'IncludeBackup', {
      type: 'String',
    });

    const includeSecurityHub = new CfnParameter(this, 'IncludeSecurityHub', {
      type: 'String',
    });

    const scpRoot = new CustomResource(this, 'SCPRoot', {
      serviceToken: ServiceControlPolicyRootProvider.getOrCreate(this),
      properties: {
        includeSecHub: includeSecurityHub.valueAsString,
        includeBackup: includeBackup.valueAsString,
        partition: Stack.of(this).partition,
        scpName: 'superwerker-root',
      },
    });

    (scpRoot.node.defaultChild as CfnResource).overrideLogicalId('SCPRoot');
  }
}

class ServiceControlPolicyRootProvider extends Construct {
  public static getOrCreate(scope: Construct) {
    const stack = Stack.of(scope);
    const id = 'superwerker.service-control-policy-root-provider';
    const x = (stack.node.tryFindChild(id) as ServiceControlPolicyRootProvider) || new ServiceControlPolicyRootProvider(stack, id);
    return x.provider.serviceToken;
  }

  private readonly provider: Provider;

  constructor(scope: Construct, id: string) {
    super(scope, id);
    const scpRootFn = new NodejsFunction(this, 'service-control-policy-root-on-event', {
      entry: path.join(__dirname, '..', 'functions', 'service-control-policies-root.ts'),
      runtime: Runtime.NODEJS_20_X,
      initialPolicy: [
        new PolicyStatement({
          effect: Effect.ALLOW,
          resources: ['*'],
          actions: [
            'organizations:CreatePolicy',
            'organizations:UpdatePolicy',
            'organizations:DeletePolicy',
            'organizations:AttachPolicy',
            'organizations:DetachPolicy',
            'organizations:ListRoots',
            'organizations:ListPolicies',
          ],
        }),
      ],
      timeout: Duration.seconds(300),
    });

    this.provider = new Provider(this, 'service-control-policy-root-provider', {
      onEventHandler: scpRootFn,
    });
  }
}
