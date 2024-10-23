import { Duration, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as events from 'aws-cdk-lib/aws-events';
import * as target from 'aws-cdk-lib/aws-events-targets';

export class CloseOrgAccountsCdkStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const closeOrgAccountsRole = new iam.Role(this, 'CloseOrgAccountsRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    const closeOrgAccountsPolicy = new iam.ManagedPolicy(this, 'CloseOrgAccountsPolicy', {
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ["organizations:ListAccountsForParent",
            "organizations:CloseAccount",
            "organizations:ListOrganizationalUnitsForParent",
            "organizations:ListRoots"],
          resources: ['*']
        }),
      ]
    });

    closeOrgAccountsRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole',),
    );
    closeOrgAccountsRole.addManagedPolicy(closeOrgAccountsPolicy);

    const handler = new lambda.Function(this, 'CloseOrgAccountsLambda', {
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda')),
      runtime: lambda.Runtime.PYTHON_3_12,
      timeout: cdk.Duration.minutes(5),
      role: closeOrgAccountsRole,
      retryAttempts: 0
    });

    const lambdaTarget = new target.LambdaFunction(handler)

    const closeOrgAccountsRule = new events.Rule(this, 'CloseOrgAccountsRule', {
      schedule: events.Schedule.rate(Duration.days(1)),
      targets: [lambdaTarget],
    });

  }
}