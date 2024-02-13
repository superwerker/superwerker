import * as path from 'path';
import { CustomResource, Duration, Stack } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import * as lambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

interface PrepareAccountProps {
  readonly orgCreatedSignal: string;
  readonly controlTowerVersionParameter: string;
  readonly controlTowerRegionsParameter: string;
  readonly controlTowerKmsKeyParameter: string;
  readonly controlTowerKmsKeyArn: string;
  readonly controlTowerSecurityOuSsmParameter: string;
  readonly controlTowerSandboxOuSsmParameter: string;
  readonly controlTowerBucketRetetionLoggingParameter: string;
  readonly controlTowerBucketRetetionAccessLoggingParameter: string;
}

export class PrepareAccount extends Construct {
  constructor(scope: Construct, id: string, props: PrepareAccountProps) {
    super(scope, id);

    new CustomResource(this, 'Resource', {
      serviceToken: PrepareAccountProvider.getOrCreate(this),
      resourceType: 'Custom::PrepareAccount',
      properties: {
        SIGNAL_URL: props.orgCreatedSignal,
        CONTROL_TOWER_VERSION_PARAMETER: props.controlTowerVersionParameter,
        CONTROL_TOWER_REGIONS_PARAMETER: props.controlTowerRegionsParameter,
        CONTROL_TOWER_KMS_KEY_PARAMETER: props.controlTowerKmsKeyParameter,
        CONTROL_TOWER_KMS_KEY_ARN: props.controlTowerKmsKeyArn,
        CONTROL_TOWER_SECURITY_OU_PARAMETER: props.controlTowerSecurityOuSsmParameter,
        CONTROL_TOWER_SANDBOX_OU_PARAMETER: props.controlTowerSandboxOuSsmParameter,
        CONTROL_TOWER_BUCKET_RETENTION_LOGGING_PARAMETER: props.controlTowerBucketRetetionLoggingParameter,
        CONTROL_TOWER_BUCKET_RETENTION_ACCESS_LOGGING_PARAMETER: props.controlTowerBucketRetetionAccessLoggingParameter,
      },
    });
  }
}

class PrepareAccountProvider extends Construct {
  /**
   * Returns the singleton provider.
   */
  public static getOrCreate(scope: Construct) {
    const stack = Stack.of(scope);
    const id = 'superwerker.prepare-account-provider';
    const x = (stack.node.tryFindChild(id) as PrepareAccountProvider) || new PrepareAccountProvider(stack, id);
    return x.provider.serviceToken;
  }

  private readonly provider: cr.Provider;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.provider = new cr.Provider(this, 'prepare-account-provider', {
      onEventHandler: new lambda.NodejsFunction(this, 'prepare-account-on-event', {
        entry: path.join(__dirname, '..', 'functions', 'prepare-account.ts'),
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
