import path from 'path';
import { NestedStack, NestedStackProps, aws_lambda as lambda, aws_iam as iam, Duration, Arn, ArnFormat, CfnParameter } from 'aws-cdk-lib';
import { Dashboard, CustomWidget } from 'aws-cdk-lib/aws-cloudwatch';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';

export class LivingDocumentationStack extends NestedStack {
  constructor(scope: Construct, id: string, props: NestedStackProps) {
    super(scope, id, props);

    const superwerkerDomain = new CfnParameter(this, 'SuperwerkerDomain', {
      type: 'String',
    });

    const hostedZoneParamName = new CfnParameter(this, 'HostedZoneParamName', {
      type: 'String',
    });

    const propagationParamName = new CfnParameter(this, 'PropagationParamName', {
      type: 'String',
    });

    // DashboardGeneratorFunction
    const dashboardGeneratorFunction = new NodejsFunction(this, 'DashboardGeneratorFunction', {
      entry: path.join(__dirname, '..', 'functions', 'living-docs-dashboard-generator.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: Duration.minutes(1),
      environment: {
        SUPERWERKER_DOMAIN: superwerkerDomain.valueAsString,
        HOSTEDZONE_PARAM_NAME: hostedZoneParamName.valueAsString,
        PROPAGATION_PARAM_NAME: propagationParamName.valueAsString,
      },
    });

    (dashboardGeneratorFunction.node.defaultChild as lambda.CfnFunction).overrideLogicalId('DashboardGeneratorFunction');

    const superwerkerDashboard = new Dashboard(this, 'SuperwerkerDashboard', {
      dashboardName: 'Superwerker-LivingDocumentation',
    });

    superwerkerDashboard.addWidgets(
      new CustomWidget({
        title: '',
        width: 20,
        height: 17,
        updateOnRefresh: true,
        functionArn: dashboardGeneratorFunction.functionArn,
      }),
    );

    const ssmParametersDescribe = new iam.PolicyStatement({
      actions: ['ssm:DescribeParameters'],
      resources: ['*'],
      effect: iam.Effect.ALLOW,
    });

    const ssmParameterRead = new iam.PolicyStatement({
      actions: ['ssm:GetParameters', 'ssm:GetParameter', 'ssm:GetParametersByPath'],
      resources: [
        Arn.format({
          partition: this.partition,
          service: 'ssm',
          region: this.region,
          account: this.account,
          resource: 'parameter',
          resourceName: 'superwerker/*',
        }),
      ],
      effect: iam.Effect.ALLOW,
    });

    const cloudwatchDeleteDashboard = new iam.PolicyStatement({
      actions: ['cloudwatch:DeleteDashboards'],
      resources: [
        Arn.format({
          partition: this.partition,
          service: 'cloudwatch',
          region: '',
          account: this.account,
          resource: 'dashboard',
          resourceName: 'superwerker',
          arnFormat: ArnFormat.SLASH_RESOURCE_NAME, // which is the default
        }),
      ],
      effect: iam.Effect.ALLOW,
    });

    const cloudwatchDescribeAlarms = new iam.PolicyStatement({
      actions: ['cloudwatch:DescribeAlarms'],
      resources: [
        Arn.format({
          partition: this.partition,
          service: 'cloudwatch',
          region: this.region,
          account: this.account,
          resource: 'alarm',
          resourceName: 'superwerker-RootMailReady',
          arnFormat: ArnFormat.COLON_RESOURCE_NAME,
        }),
      ],
      effect: iam.Effect.ALLOW,
    });

    dashboardGeneratorFunction.role!.attachInlinePolicy(
      new iam.Policy(this, 'dashboard-generator-function', {
        statements: [ssmParametersDescribe, ssmParameterRead, cloudwatchDeleteDashboard, cloudwatchDescribeAlarms],
      }),
    );
  }
}
