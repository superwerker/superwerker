import * as path from 'path';
import { CustomResource, Duration, Stack } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import * as lambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

interface InstallControltowerCustomizationsProps {
  /**
   * Version of the landing zone customizations to install
   */
  readonly controlTowerCustomizationsVersion: string;
  /**
   * SNS topic to notify about updates to the stack
   */
  readonly notificationsTopic: string;
  /**
   * SSM parameter storing if configuration is done
   */
  readonly ssmParameterName: string;
}

export class InstallControltowerCustomizations extends Construct {
  constructor(scope: Construct, id: string, props: InstallControltowerCustomizationsProps) {
    super(scope, id);

    new CustomResource(this, 'Resource', {
      serviceToken: InstallControltowerCustomizationsProvider.getOrCreate(this),
      resourceType: 'Custom::InstallControltowerCustomizations',
      properties: {
        CONTROLTOWER_CUSTOMIZATIONS_VERSION: props.controlTowerCustomizationsVersion,
        SNS_NOTIFICATIONS_ARN: props.notificationsTopic,
        CONTROLTOWER_CUSTOMIZATIONS_DONE_SSM_PARAMETER: props.ssmParameterName,
      },
    });
  }
}

class InstallControltowerCustomizationsProvider extends Construct {
  /**
   * Returns the singleton provider.
   */
  public static getOrCreate(scope: Construct) {
    const stack = Stack.of(scope);
    const id = 'superwerker.install-controltower-customizations';
    const x =
      (stack.node.tryFindChild(id) as InstallControltowerCustomizationsProvider) ||
      new InstallControltowerCustomizationsProvider(stack, id);
    return x.provider.serviceToken;
  }

  private readonly provider: cr.Provider;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const fnRole = new iam.Role(this, 'InstallControlTowerCustomizationsCustomResourceRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });
    (fnRole.node.defaultChild as iam.CfnRole).overrideLogicalId('InstallControlTowerCustomizationsCustomResourceRole');

    fnRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'));

    fnRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess'));

    fnRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AWSCloudFormationFullAccess'));

    fnRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'));

    this.provider = new cr.Provider(this, 'install-controltower-customizations-provider', {
      onEventHandler: new lambda.NodejsFunction(this, 'install-controltower-customizations-on-event', {
        entry: path.join(__dirname, '..', 'functions', 'install-controltower-customizations.ts'),
        runtime: Runtime.NODEJS_18_X,
        role: fnRole,
        timeout: Duration.minutes(15),
      }),
    });
  }
}
