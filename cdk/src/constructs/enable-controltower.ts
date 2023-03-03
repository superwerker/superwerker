import * as path from 'path';
import * as pythonLambda from '@aws-cdk/aws-lambda-python-alpha';
import { aws_lambda as lambda, CfnCustomResource, CustomResource, Duration, Stack } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';


interface EnableControltowerProps {
  /**
   * Email of the audit aws account
   */
  readonly auditAwsAccountEmail: string;
  /**
   * Email of the log archive aws account
   */
  readonly logArchiveAwsAccountEmail: string;
}

export class EnableControltower extends Construct {
  constructor(scope: Construct, id: string, props: EnableControltowerProps) {
    super(scope, id);

    const resource = new CustomResource(this, 'Resource', {
      serviceToken: EnableControltowerProvider.getOrCreate(this),
      resourceType: 'Custom::EnableControltower',
      properties: {
        LOG_ARCHIVE_AWS_ACCOUNT_EMAIL: props.logArchiveAwsAccountEmail,
        AUDIT_AWS_ACCOUNT_EMAIL: props.auditAwsAccountEmail,
      },
    });
    (resource.node.defaultChild as CfnCustomResource).overrideLogicalId(id);
  }
}

class EnableControltowerProvider extends Construct {

  /**
   * Returns the singleton provider.
   */
  public static getOrCreate(scope: Construct) {
    const stack = Stack.of(scope);
    const id = 'superwerker.enable-controltower';
    const x = stack.node.tryFindChild(id) as EnableControltowerProvider || new EnableControltowerProvider(stack, id);
    return x.provider.serviceToken;
  }

  private readonly provider: cr.Provider;

  private constructor(scope: Construct, id: string) {
    super(scope, id);
    const fnRole = new iam.Role(this, 'SetupControlTowerCustomResourceRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });
    (fnRole.node.defaultChild as iam.CfnRole).overrideLogicalId('SetupControlTowerCustomResourceRole');

    fnRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
    );

    const enableControltowerFn = new pythonLambda.PythonFunction(this, 'enable-controltower-on-event', {
      entry: path.join(__dirname, '..', 'functions', 'enable_controltower'),
      handler: 'handler',
      runtime: lambda.Runtime.PYTHON_3_9,
      role: fnRole,
      timeout: Duration.seconds(900),
    });
    (enableControltowerFn.node.defaultChild as lambda.CfnFunction).overrideLogicalId('SetupControlTowerCustomResource');

    const awsApiLibRole = new iam.Role(this, 'AwsApilibRole', {
      assumedBy: fnRole,
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'),
      ],
    });
    (awsApiLibRole.node.defaultChild as iam.CfnRole).overrideLogicalId('AwsApiLibRole');

    const fnPolicy = new iam.Policy(this, 'SetupControlTowerCustomResourceRolePolicy', {
      statements: [
        new iam.PolicyStatement({
          actions: [
            'sts:AssumeRole',
          ],
          resources: [
            awsApiLibRole.roleArn,
          ],
        }),
      ],
    });
    (fnPolicy.node.defaultChild as iam.CfnPolicy).overrideLogicalId('SetupControlTowerCustomResourceRolePolicy');
    fnRole.attachInlinePolicy(fnPolicy);
    enableControltowerFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'sts:AssumeRole',
        ],
        resources: [
          awsApiLibRole.roleArn,
        ],
      }),
    );

    enableControltowerFn.addEnvironment('AWSAPILIB_CONTROL_TOWER_ROLE_ARN', awsApiLibRole.roleArn);

    this.provider = new cr.Provider(this, 'enable-controltower-provider', {
      onEventHandler: enableControltowerFn,
    });
  }
}
