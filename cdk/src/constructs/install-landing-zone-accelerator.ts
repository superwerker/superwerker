import * as path from 'path';
import { CustomResource, Duration, Stack } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import * as lambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

interface InstallLandingZoneAcceleratorProps {
  /**
   * Version of the landing zone accelerator to install
   */
  readonly lzaVersion: string;
  /**
   * Email of the audit aws account
   */
  readonly auditAwsAccountEmail: string;
  /**
   * Email of the log archive aws account
   */
  readonly logArchiveAwsAccountEmail: string;
}

export class InstallLandingZoneAccelerator extends Construct {
  constructor(scope: Construct, id: string, props: InstallLandingZoneAcceleratorProps) {
    super(scope, id);

    new CustomResource(this, 'Resource', {
      serviceToken: InstallLandingZoneAcceleratorProvider.getOrCreate(this),
      resourceType: 'Custom::InstallLandingZoneAccelerator',
      properties: {
        LZA_VERSION: props.lzaVersion,
        LOG_ARCHIVE_AWS_ACCOUNT_EMAIL: props.logArchiveAwsAccountEmail,
        AUDIT_AWS_ACCOUNT_EMAIL: props.auditAwsAccountEmail,
      },
    });
  }
}

class InstallLandingZoneAcceleratorProvider extends Construct {
  /**
   * Returns the singleton provider.
   */
  public static getOrCreate(scope: Construct) {
    const stack = Stack.of(scope);
    const id = 'superwerker.install-landing-zone-accelerator';
    const x =
      (stack.node.tryFindChild(id) as InstallLandingZoneAcceleratorProvider) || new InstallLandingZoneAcceleratorProvider(stack, id);
    return x.provider.serviceToken;
  }

  private readonly provider: cr.Provider;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const fnRole = new iam.Role(this, 'InstallLandingZoneAcceleratorCustomResourceRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });
    (fnRole.node.defaultChild as iam.CfnRole).overrideLogicalId('InstallLandingZoneAcceleratorCustomResourceRole');

    fnRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'));

    fnRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess'));

    fnRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AWSCloudFormationFullAccess'));

    fnRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'));

    this.provider = new cr.Provider(this, 'install-landing-zone-accelerator-provider', {
      onEventHandler: new lambda.NodejsFunction(this, 'install-landing-zone-accelerator-on-event', {
        entry: path.join(__dirname, '..', 'functions', 'install-landing-zone-accelerator.ts'),
        runtime: Runtime.NODEJS_18_X,
        role: fnRole,
        timeout: Duration.minutes(15),
      }),
    });
  }
}
