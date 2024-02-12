import * as path from 'path';
import { CustomResource, Duration, Stack } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import * as lambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

interface CreateOrganizationsProps {
  readonly orgCreatedSignal: string;
  readonly controlTowerVersionParameter: string;
  readonly controlTowerRegionsParameter: string;
  readonly securityOuSsmParameter: string;
  readonly sandboxOuSsmParameter: string;
  readonly bucketRetetionLoggingParameter: string;
  readonly bucketRetetionAccessLoggingParameter: string;
}

export class CreateOrganizations extends Construct {
  constructor(scope: Construct, id: string, props: CreateOrganizationsProps) {
    super(scope, id);

    new CustomResource(this, 'Resource', {
      serviceToken: CreateOrganizationsProvider.getOrCreate(this),
      resourceType: 'Custom::CreateOrganizations',
      properties: {
        SIGNAL_URL: props.orgCreatedSignal,
        CONTROL_TOWER_VERSION: props.controlTowerVersionParameter,
        CONTROL_TOWER_REGIONS: props.controlTowerRegionsParameter,
        SECURITY_OU_SSM_PARAMETER: props.securityOuSsmParameter,
        SANDBOX_OU_SSM_PARAMETER: props.sandboxOuSsmParameter,
        BUCKET_RETENTION_LOGGING: props.bucketRetetionLoggingParameter,
        BUCKET_RETENTION_ACCESS_LOGGING: props.bucketRetetionAccessLoggingParameter,
      },
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
        timeout: Duration.seconds(60),
        initialPolicy: [
          new iam.PolicyStatement({
            actions: ['ssm:PutParameter'],
            resources: ['arn:aws:ssm:*:*:parameter/superwerker/*'],
          }),
          new iam.PolicyStatement({
            actions: ['organizations:CreateOrganization'],
            resources: ['*'],
          }),
          new iam.PolicyStatement({
            actions: ['iam:CreateServiceLinkedRole'],
            resources: ['arn:aws:iam::*:role/aws-service-role/organizations.amazonaws.com/AWSServiceRoleForOrganizations*'],
            conditions: {
              StringEquals: {
                'iam:AWSServiceName': 'organizations.amazonaws.com',
              },
            },
          }),
        ],
      }),
    });
  }
}
