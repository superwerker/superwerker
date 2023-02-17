import * as path from 'path';
import {
  aws_iam as iam,
  aws_lambda as lambda,
  aws_lambda_nodejs as nodejs,
  CfnCustomResource,
  CustomResource,
  custom_resources as cr,
  Stack,
  CfnCondition,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ATTACH, POLICY } from '../functions/attach-scp';


export interface AttachSCPProps {
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

  /**
   * Only attach SCP if condition is true
   */
  readonly condition: CfnCondition;
}

export class AttachSCP extends Construct {
  constructor(scope: Construct, id: string, props: AttachSCPProps) {
    super(scope, id);

    const resource = new CustomResource(this, 'AttachSCPResource', {
      serviceToken: AttachSCPProvider.getOrCreate(this),
      resourceType: 'Custom::AttachSCP',
      properties: {
        [POLICY]: props.policy,
        [ATTACH]: props.attach ?? true,
      },
    });
    (resource.node.defaultChild as CfnCustomResource).overrideLogicalId(id);
    (resource.node.defaultChild as CfnCustomResource).cfnOptions.condition = props.condition;
  }
}

class AttachSCPProvider extends Construct {

  /**
   * Returns the singleton provider.
   */
  public static getOrCreate(scope: Construct) {
    const stack = Stack.of(scope);
    const id = 'superwerker.attach-scp';
    const x = stack.node.tryFindChild(id) as AttachSCPProvider ||
      new AttachSCPProvider(stack, id);
    return x.provider.serviceToken;
  }

  private readonly provider: cr.Provider;

  constructor(scope: Construct, id: string) {
    super(scope, id);
    const attachSCPFn = new nodejs.NodejsFunction(this, id, {
      entry: path.join(__dirname, '..', 'functions', 'attach-scp.ts'),
      runtime: lambda.Runtime.NODEJS_16_X,
    });
    (attachSCPFn.node.defaultChild as lambda.CfnFunction).overrideLogicalId('SCPCustomResource');

    attachSCPFn.role!.addToPrincipalPolicy(
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

    this.provider = new cr.Provider(this, 'attach-scp', {
      onEventHandler: attachSCPFn,
    });
  }
}
