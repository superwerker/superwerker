import * as path from 'path';
import { CustomResource, Stack } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import * as lambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct, Node } from 'constructs';
import { ATTR_EMAIL, PROP_DOMAIN, PROP_NAME } from '../functions/generate-mail-address';

interface GenerateEmailAddressProps {
  /**
   * The domain for the email to be generated, ....@<domain>
   */
  readonly domain: string;

  /**
   * The account name.
   */
  readonly name: string;
}

export class GenerateEmailAddress extends Construct {
  public readonly email: string;
  constructor(scope: Construct, id: string, props: GenerateEmailAddressProps) {
    super(scope, id);

    const resource = new CustomResource(this, 'Resource', {
      serviceToken: GenerateEmailAddressProvider.getOrCreate(this),
      resourceType: 'Custom::GenerateEmailAddress',
      properties: {
        [PROP_DOMAIN]: props.domain,
        [PROP_NAME]: props.name,
      },
    });

    this.email = resource.getAttString(ATTR_EMAIL);
  }
}

class GenerateEmailAddressProvider extends Construct {

  /**
   * Returns the singleton provider.
   */
  public static getOrCreate(scope: Construct) {
    const stack = Stack.of(scope);
    const id = 'superwerker.generate-email-address-provider';
    const x = Node.of(stack).tryFindChild(id) as GenerateEmailAddressProvider || new GenerateEmailAddressProvider(stack, id);
    return x.provider.serviceToken;
  }

  private readonly provider: cr.Provider;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.provider = new cr.Provider(this, 'generate-email-address-provider', {
      onEventHandler: new lambda.NodejsFunction(this, 'generate-email-address-on-event', {
        entry: path.join(__dirname, '..', 'functions', 'generate-mail-address.ts'),
        runtime: Runtime.NODEJS_20_X,
        initialPolicy: [
          new iam.PolicyStatement({
            resources: ['*'],
            actions: [
              'organizations:ListAccounts',
              'organizations:ListAccountsForParent',
              'organizations:ListOrganizationalUnitsForParent',
              'organizations:ListRoots',

            ],
          }),
        ],
      }),
    });
  }
}