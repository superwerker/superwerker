import * as path from 'path';
import * as pythonLambda from '@aws-cdk/aws-lambda-python-alpha';
import { CustomResource, Stack, aws_lambda as lambda, aws_iam as iam, custom_resources as cr } from 'aws-cdk-lib';
import { Construct } from 'constructs';


export class EnableCloudFormationStacksetsOrgAccess extends Construct {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    new CustomResource(this, 'Resource', {
      serviceToken: EnableCloudformationStacksetsOrgAccessProvider.getOrCreate(this),
      resourceType: 'Custom::EnableCloudFormationStacksetsOrgAccess',
    });
  }
}

class EnableCloudformationStacksetsOrgAccessProvider extends Construct {

  /**
   * Returns the singleton provider.
   */
  public static getOrCreate(scope: Construct) {
    const stack = Stack.of(scope);
    const id = 'superwerker.enable-cfn-stack-sets-org-access';
    const x = stack.node.tryFindChild(id) as EnableCloudformationStacksetsOrgAccessProvider ||
      new EnableCloudformationStacksetsOrgAccessProvider(stack, id);
    return x.provider.serviceToken;
  }

  private readonly provider: cr.Provider;

  constructor(scope: Construct, id: string) {
    super(scope, id);
    const enableCfnStacksSetsOrgAccessFn = new pythonLambda.PythonFunction(this, 'enable-cfn-stack-sets-org-access-fn', {
      entry: path.join(__dirname, '..', 'functions', 'enable_cfn_stack_sets_org_access'),
      handler: 'handler',
      runtime: lambda.Runtime.PYTHON_3_9,
    });

    const awsApilibRole = new iam.Role(this, 'AwsApilibRole', {
      assumedBy: enableCfnStacksSetsOrgAccessFn.role as iam.Role,
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'),
      ],
    });

    enableCfnStacksSetsOrgAccessFn.addEnvironment(
      'AWSAPILIB_ROLE_ARN', awsApilibRole.roleArn,
    );

    awsApilibRole.grantAssumeRole(enableCfnStacksSetsOrgAccessFn.role!);

    this.provider = new cr.Provider(this, 'enable-cfn-stack-sets-org-access-provider', {
      onEventHandler: enableCfnStacksSetsOrgAccessFn,
    });
  }
}
