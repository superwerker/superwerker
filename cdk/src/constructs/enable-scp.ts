import * as path from 'path';
import {
  aws_iam as iam,
  aws_lambda as lambda,
  aws_lambda_nodejs as nodejs,
  CfnCustomResource,
  CustomResource,
  custom_resources as cr,
  Stack,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';


export class EnableSCP extends Construct {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    const resource = new CustomResource(this, 'EnableSCPResource', {
      serviceToken: EnableSCPProvider.getOrCreate(this),
      resourceType: 'Custom::EnableSCP',
    });
    (resource.node.defaultChild as CfnCustomResource).overrideLogicalId(id);
  }
}

class EnableSCPProvider extends Construct {

  /**
   * Returns the singleton provider.
   */
  public static getOrCreate(scope: Construct) {
    const stack = Stack.of(scope);
    const id = 'superwerker.enable-scp';
    const x = stack.node.tryFindChild(id) as EnableSCPProvider ||
      new EnableSCPProvider(stack, id);
    return x.provider.serviceToken;
  }

  private readonly provider: cr.Provider;

  constructor(scope: Construct, id: string) {
    super(scope, id);
    const enableSCPFn = new nodejs.NodejsFunction(this, id, {
      entry: path.join(__dirname, '..', 'functions', 'enable-scp.ts'),
      runtime: lambda.Runtime.NODEJS_16_X,
    });
    (enableSCPFn.node.defaultChild as lambda.CfnFunction).overrideLogicalId('SCPEnableCustomResource');

    enableSCPFn.role!.addToPrincipalPolicy(
      new iam.PolicyStatement({
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

    this.provider = new cr.Provider(this, 'enable-scp', {
      onEventHandler: enableSCPFn,
    });
  }
}
