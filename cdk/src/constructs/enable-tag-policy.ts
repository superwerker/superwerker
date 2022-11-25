import * as path from 'path';
import { aws_iam as iam, aws_lambda as lambda, aws_lambda_nodejs as nodejs, CustomResource, custom_resources as cr, Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';


export interface AttachTagPolicyProps {
  /**
   * The policy to create
   */
  readonly policy: string;

  /**
   * If set to true, the created policy will also be attached
   *
   * @default: true
   */
  readonly attach?: boolean;
}

export class EnableTagPolicy extends Construct {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    new CustomResource(this, 'Resource', {
      serviceToken: EnableTagPolicyProvider.getOrCreate(this),
      resourceType: 'Custom::EnableTagPolicies',
    });
  }
}

class EnableTagPolicyProvider extends Construct {

  /**
   * Returns the singleton provider.
   */
  public static getOrCreate(scope: Construct) {
    const stack = Stack.of(scope);
    const id = 'superwerker.enable-tag-policy';
    const x = stack.node.tryFindChild(id) as EnableTagPolicyProvider ||
      new EnableTagPolicyProvider(stack, id);
    return x.provider.serviceToken;
  }

  private readonly provider: cr.Provider;

  constructor(scope: Construct, id: string) {
    super(scope, id);
    const enableTagPolicyFn = new nodejs.NodejsFunction(this, id, {
      entry: path.join(__dirname, '..', 'functions', 'enable-tag-policy.ts'),
      runtime: lambda.Runtime.NODEJS_16_X,
    });

    enableTagPolicyFn.role!.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'organizations:EnablePolicyType',
          'organizations:DisablePolicyType',
          'organizations:ListRoots',
        ],
        resources: [
          '*',
        ],
      }),
    );

    this.provider = new cr.Provider(this, 'enable-tag-policies', {
      onEventHandler: enableTagPolicyFn,
    });
  }
}
