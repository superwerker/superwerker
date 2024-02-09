import * as path from 'path';
import { CustomResource, Stack } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import * as lambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

export class CreateOrganizations extends Construct {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    new CustomResource(this, 'Resource', {
      serviceToken: CreateOrganizationsProvider.getOrCreate(this),
      resourceType: 'Custom::CreateOrganizations',
    });
  }
}

class CreateOrganizationsProvider extends Construct {
  /**
   * Returns the singleton provider.
   */
  public static getOrCreate(scope: Construct) {
    const stack = Stack.of(scope);
    const id = 'superwerker.create-organizations-provider';
    const x = (stack.node.tryFindChild(id) as CreateOrganizationsProvider) || new CreateOrganizationsProvider(stack, id);
    return x.provider.serviceToken;
  }

  private readonly provider: cr.Provider;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.provider = new cr.Provider(this, 'create-organizations-provider', {
      onEventHandler: new lambda.NodejsFunction(this, 'create-organizations-on-event', {
        entry: path.join(__dirname, '..', 'functions', 'create-organizations.ts'),
        runtime: Runtime.NODEJS_16_X,
        initialPolicy: [
          new iam.PolicyStatement({
            resources: ['*'],
            actions: ['organizations:CreateOrganization'],
          }),
        ],
      }),
    });
  }
}
