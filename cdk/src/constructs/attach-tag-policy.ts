import * as path from 'path';
import { aws_iam as iam, aws_lambda as lambda, aws_lambda_nodejs as nodejs, CfnCustomResource, CustomResource, custom_resources as cr, Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ATTACH, POLICY } from '../functions/attach-tag-policy';


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

export class AttachTagPolicy extends Construct {
  constructor(scope: Construct, id: string, props: AttachTagPolicyProps) {
    super(scope, id);

    const resource = new CustomResource(this, 'AttachTagPolicyResource', {
      serviceToken: AttachTagPolicyProvider.getOrCreate(this),
      resourceType: 'Custom::AttachTagPolicy',
      properties: {
        [POLICY]: props.policy,
        [ATTACH]: props.attach ?? true,
      },
    });
    (resource.node.defaultChild as CfnCustomResource).overrideLogicalId(id);
  }
}

class AttachTagPolicyProvider extends Construct {

  /**
   * Returns the singleton provider.
   */
  public static getOrCreate(scope: Construct) {
    const stack = Stack.of(scope);
    const id = 'superwerker.attach-tag-policy';
    const x = stack.node.tryFindChild(id) as AttachTagPolicyProvider ||
      new AttachTagPolicyProvider(stack, id);
    return x.provider.serviceToken;
  }

  private readonly provider: cr.Provider;

  constructor(scope: Construct, id: string) {
    super(scope, id);
    const attachTagPolicyFn = new nodejs.NodejsFunction(this, id, {
      entry: path.join(__dirname, '..', 'functions', 'attach-tag-policy.ts'),
      runtime: lambda.Runtime.NODEJS_16_X,
    });

    attachTagPolicyFn.role!.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'organizations:CreatePolicy',
          'organizations:UpdatePolicy',
          'organizations:DeletePolicy',
          'organizations:AttachPolicy',
          'organizations:DetachPolicy',
          'organizations:ListRoots',
          'organizations:ListPolicies',
          'organizations:ListPoliciesForTarget',
        ],
        resources: [
          '*',
        ],
      }),
    );

    this.provider = new cr.Provider(this, 'attach-tag-policy', {
      onEventHandler: attachTagPolicyFn,
    });
  }
}
