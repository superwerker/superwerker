import path from 'path';
import { NestedStack, NestedStackProps, Stack, custom_resources as cr, aws_lambda_nodejs as lambda, CustomResource } from 'aws-cdk-lib';
import { CfnInclude } from 'aws-cdk-lib/cloudformation-include';
import { Construct, Node } from 'constructs';

export class BackupStack extends NestedStack {
  constructor(scope: Construct, id: string, props: NestedStackProps) {
    super(scope, id, props);
    new CfnInclude(this, 'SuperwerkerTemplate', {
      templateFile: path.join(__dirname, '..', '..', '..', 'templates', 'backup.yaml'),
    });

    new OrganizationsLookup(this, 'Lookup');
  }
}

class OrganizationsLookup extends Construct {
  orgRoot: string;
  constructor(scope: Construct, id: string) {
    super(scope, id);
    const resource = new CustomResource(this, 'OrganizationsLookup', {
      serviceToken: OrganizationsLookupCustomResourceProvider.getOrCreate(this),
      resourceType: 'Custom::OrganizationsLookup',
    });
    this.orgRoot = resource.getAttString('Arn');
  }
}

class OrganizationsLookupCustomResourceProvider extends Construct {
  public static getOrCreate(scope: Construct) {
    const stack = Stack.of(scope);
    const id = 'com.amazonaws.cdk.custom-resources.s3file-provider';
    const x = stack.node.tryFindChild(id) as OrganizationsLookupCustomResourceProvider ||
      new OrganizationsLookupCustomResourceProvider(stack, id);
    return x.provider.serviceToken;
  }

  private readonly provider: cr.Provider;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.provider = new cr.Provider(this, 'OrganizationsLookupProvider', {
      onEventHandler: new lambda.NodejsFunction(this, 'organizationsLookupFn', {
      }),
    });
  }
}
