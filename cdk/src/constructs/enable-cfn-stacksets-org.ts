import * as path from 'path';
import * as pythonLambda from '@aws-cdk/aws-lambda-python-alpha';
import { CustomResource, Stack, aws_lambda as lambda, aws_iam as iam, custom_resources as cr, CfnCustomResource } from 'aws-cdk-lib';
import { Construct } from 'constructs';


export class EnableCloudFormationStacksetsOrgAccess extends Construct {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    const enableCloudFormationStacksetsOrgAccess = new CustomResource(this, 'EnableCloudFormationStacksetsOrgAccessCustomResource', {
      serviceToken: EnableCloudformationStacksetsOrgAccessProvider.getOrCreate(this),
      resourceType: 'Custom::EnableCloudFormationStacksetsOrgAccess',
    });
    (enableCloudFormationStacksetsOrgAccess.node.defaultChild as CfnCustomResource).overrideLogicalId('EnableCloudFormationStacksetsOrgAccessCustomResource');
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

    const enableCfnStacksSetsOrgAccessFnRole = new iam.Role(this, 'EnableCloudFormationStacksetsOrgAccessCustomResourceRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });
    (enableCfnStacksSetsOrgAccessFnRole.node.defaultChild as iam.CfnRole).overrideLogicalId('EnableCloudFormationStacksetsOrgAccessCustomResourceRole');

    const enableCfnStacksSetsOrgAccessFn = new pythonLambda.PythonFunction(this, 'enable-cfn-stack-sets-org-access-fn', {
      entry: path.join(__dirname, '..', 'functions', 'enable_cfn_stack_sets_org_access'),
      handler: 'handler',
      runtime: lambda.Runtime.PYTHON_3_9,
      role: enableCfnStacksSetsOrgAccessFnRole,
    });
    (enableCfnStacksSetsOrgAccessFn.node.defaultChild as lambda.CfnFunction).overrideLogicalId('EnableCloudFormationStacksetsOrgAccessCustomResourceFunction');

    const awsApiLibRole = new iam.Role(this, 'AwsApiLibRole', {
      assumedBy: enableCfnStacksSetsOrgAccessFn.role as iam.Role,
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'),
      ],
    });
    const enableCfnStacksSetsOrgAccessFnPolicy = new iam.Policy(this, 'EnableCloudFormationStacksetsOrgAccessCustomResourceRolePolicy', {
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
      roles: [
        enableCfnStacksSetsOrgAccessFnRole,
      ],
    });
    (enableCfnStacksSetsOrgAccessFnPolicy.node.defaultChild as iam.CfnPolicy).overrideLogicalId('EnableCloudFormationStacksetsOrgAccessCustomResourceRolePolicy');

    (awsApiLibRole.node.defaultChild as iam.CfnRole).overrideLogicalId('AwsApiLibRole');

    enableCfnStacksSetsOrgAccessFn.addEnvironment(
      'AWSAPILIB_ROLE_ARN', awsApiLibRole.roleArn,
    );

    awsApiLibRole.grantAssumeRole(enableCfnStacksSetsOrgAccessFn.role!);

    this.provider = new cr.Provider(this, 'enable-cfn-stack-sets-org-access-provider', {
      onEventHandler: enableCfnStacksSetsOrgAccessFn,
    });
  }
}
