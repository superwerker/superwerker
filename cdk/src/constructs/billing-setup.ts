import * as path from 'path';
import { PythonFunction } from '@aws-cdk/aws-lambda-python-alpha';
import { CustomResource, Duration, Stack, aws_lambda as lambda } from 'aws-cdk-lib';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

export class BillingSetup extends Construct {
  public billingSetupFn: PythonFunction;
  constructor(scope: Construct, id: string) {
    super(scope, id);

    new CustomResource(this, 'Resource', {
      serviceToken: BillingSetupProvider.getOrCreate(this).provider.serviceToken,
      resourceType: 'Custom::BillingSetup',
    });
    this.billingSetupFn = BillingSetupProvider.getOrCreate(this).provider.onEventHandler as PythonFunction;
  }
}

class BillingSetupProvider extends Construct {
  /**
   * Returns the singleton provider.
   */
  public static getOrCreate(scope: Construct) {
    const stack = Stack.of(scope);
    const id = 'superwerker.billing-setup-provider';
    const provider = (stack.node.tryFindChild(id) as BillingSetupProvider) || new BillingSetupProvider(stack, id);
    return provider;
  }

  public readonly provider: cr.Provider;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const billingSetupFn = new PythonFunction(this, 'billing-setup-on-event', {
      entry: path.join(__dirname, '..', 'functions', 'billing-setup'),
      handler: 'handler',
      runtime: Runtime.PYTHON_3_12,
      timeout: Duration.seconds(30),
    });
    (billingSetupFn.node.defaultChild as lambda.CfnFunction).overrideLogicalId('BillingSetupFunction');

    this.provider = new cr.Provider(this, 'billing-setup-provider', {
      onEventHandler: billingSetupFn,
    });
  }
}
