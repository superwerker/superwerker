import * as path from 'path';
import { aws_iam as iam, aws_lambda as lambda, aws_lambda_nodejs as nodejs, CfnCustomResource, CustomResource, custom_resources as cr, Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ATTACH, POLICY } from '../functions/attach-backup-policy';


export interface AttachBackupPolicyProps {
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

export class AttachBackupPolicy extends Construct {
  constructor(scope: Construct, id: string, props: AttachBackupPolicyProps) {
    super(scope, id);

    const resource = new CustomResource(this, 'AttachBackupPolicyResource', {
      serviceToken: AttachBackupPolicyProvider.getOrCreate(this),
      resourceType: 'Custom::AttachBackupPolicy',
      properties: {
        [POLICY]: props.policy,
        [ATTACH]: props.attach ?? true,
      },
    });
    (resource.node.defaultChild as CfnCustomResource).overrideLogicalId(id);
  }
}

class AttachBackupPolicyProvider extends Construct {

  /**
   * Returns the singleton provider.
   */
  public static getOrCreate(scope: Construct) {
    const stack = Stack.of(scope);
    const id = 'superwerker.attach-backup-policy';
    const x = stack.node.tryFindChild(id) as AttachBackupPolicyProvider ||
      new AttachBackupPolicyProvider(stack, id);
    return x.provider.serviceToken;
  }

  private readonly provider: cr.Provider;

  constructor(scope: Construct, id: string) {
    super(scope, id);
    const attachBackupPolicyFn = new nodejs.NodejsFunction(this, id, {
      entry: path.join(__dirname, '..', 'functions', 'attach-backup-policy.ts'),
      runtime: lambda.Runtime.NODEJS_16_X,
    });
    (attachBackupPolicyFn.node.defaultChild as lambda.CfnFunction).overrideLogicalId('BackupPolicyCustomResource');

    attachBackupPolicyFn.role!.addToPrincipalPolicy(
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

    this.provider = new cr.Provider(this, 'attach-backup-policy', {
      onEventHandler: attachBackupPolicyFn,
    });
  }
}
