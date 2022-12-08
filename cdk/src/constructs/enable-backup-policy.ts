import * as path from 'path';
import { aws_iam as iam, aws_lambda as lambda, aws_lambda_nodejs as nodejs, CfnCustomResource, CustomResource, custom_resources as cr, Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';


export interface EnableBackupPolicyProps {
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

export class EnableBackupPolicy extends Construct {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    const resource = new CustomResource(this, 'Resource', {
      serviceToken: EnableBackupPolicyProvider.getOrCreate(this),
      resourceType: 'Custom::EnableBackupPolicies',
    });
    (resource.node.defaultChild as CfnCustomResource).overrideLogicalId(id);
  }
}

class EnableBackupPolicyProvider extends Construct {

  /**
   * Returns the singleton provider.
   */
  public static getOrCreate(scope: Construct) {
    const stack = Stack.of(scope);
    const id = 'superwerker.enable-backup-policy';
    const x = stack.node.tryFindChild(id) as EnableBackupPolicyProvider ||
      new EnableBackupPolicyProvider(stack, id);
    return x.provider.serviceToken;
  }

  private readonly provider: cr.Provider;

  constructor(scope: Construct, id: string) {
    super(scope, id);
    const enableBackupPolicyFn = new nodejs.NodejsFunction(this, id, {
      entry: path.join(__dirname, '..', 'functions', 'enable-backup-policy.ts'),
      runtime: lambda.Runtime.NODEJS_16_X,
    });

    enableBackupPolicyFn.role!.addToPrincipalPolicy(
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

    this.provider = new cr.Provider(this, 'enable-backup-policies', {
      onEventHandler: enableBackupPolicyFn,
    });
  }
}
