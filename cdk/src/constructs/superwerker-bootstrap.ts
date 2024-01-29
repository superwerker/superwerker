import * as path from 'path';
import { Arn, CustomResource, Stack } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import * as lambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { ATTR_EMAIL } from '../functions/generate-mail-address';


export class SuperwerkerBootstrap extends Construct {
  public readonly email: string;
  constructor(scope: Construct, id: string) {
    super(scope, id);

    const resource = new CustomResource(this, 'Resource', {
      serviceToken: SuperwerkerBootstrapProvider.getOrCreate(this),
      resourceType: 'Custom::SuperwerkerBootstrap',
    });

    this.email = resource.getAttString(ATTR_EMAIL);
  }
}

class SuperwerkerBootstrapProvider extends Construct {

  /**
   * Returns the singleton provider.
   */
  public static getOrCreate(scope: Construct) {
    const stack = Stack.of(scope);
    const id = 'superwerker.superwerker-bootstrap-provider';
    const x = stack.node.tryFindChild(id) as SuperwerkerBootstrapProvider || new SuperwerkerBootstrapProvider(stack, id);
    return x.provider.serviceToken;
  }

  private readonly provider: cr.Provider;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.provider = new cr.Provider(this, 'superwerker-bootstrap-provider', {
      onEventHandler: new lambda.NodejsFunction(this, 'superwerker-bootstrap-provider-on-event', {
        entry: path.join(__dirname, '..', 'functions', 'superwerker-bootstrap-function.ts'),
        runtime: Runtime.NODEJS_20_X,
        initialPolicy: [
          new iam.PolicyStatement({
            resources: [Arn.format(
              {
                service: 'events',
                resource: 'event-bus',
                resourceName: 'default',
              },
              Stack.of(this),
            )],
            actions: [
              'events:PutEvents',
            ],
          }),
        ],
      }),
    });
  }
}