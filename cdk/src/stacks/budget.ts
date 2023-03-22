import path from 'path';
import { Duration, NestedStack, NestedStackProps, aws_cloudwatch as cloudwatch, aws_cloudwatch_actions as cloudwatch_actions, aws_lambda as lambda, aws_budgets as budgets, aws_sns as sns, aws_iam as iam, Stack, CfnParameter } from 'aws-cdk-lib';
import { Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';

export class BudgetStack extends NestedStack {
  constructor(scope: Construct, id: string, props: NestedStackProps) {
    super(scope, id, props);

    // Parameter: BudgetLimitInUSD
    const budgetLimitInUSD = new CfnParameter(this, 'BudgetLimitInUSD', {
      type: 'Number',
      description: 'Initial value. Will be overwritten by the scheduled lambda function.',
      minValue: 10,
      default: 100,
    });

    // BudgetNotification + BudgetNotificationPolicy
    const budgetNotification = new sns.Topic(this, 'BudgetNotification');
    (budgetNotification.node.defaultChild as sns.CfnTopic).overrideLogicalId('BudgetNotification');

    const budgetNotificationPolicy = new sns.TopicPolicy(this, 'BudgetNotificationPolicy', {
      topics: [budgetNotification],
      policyDocument: new iam.PolicyDocument({
        statements: [
          new iam.PolicyStatement({
            actions: ['SNS:Publish'],
            effect: iam.Effect.ALLOW,
            principals: [new iam.ServicePrincipal('budgets.amazonaws.com')],
            resources: [budgetNotification.topicArn],
          }),
        ],
      }),
    });
    (budgetNotificationPolicy.node.defaultChild as sns.CfnTopicPolicy).overrideLogicalId('BudgetNotificationPolicy');


    // BudgetReport
    const budgetReport = new budgets.CfnBudget(this, 'BudgetReport', {
      budget: {
        budgetType: 'COST',
        timeUnit: 'MONTHLY',

        // TODO see https://github.com/superwerker/superwerker/discussions/285
        // auto adjust could replace the lambda func

        // autoAdjustData: {
        //   autoAdjustType: 'FORECAST',

        //   historicalOptions: {
        //     budgetAdjustmentPeriod: 3, // take the past 3 months for the moving average
        //   },
        // },
        budgetLimit: {
          amount: budgetLimitInUSD.valueAsNumber,
          unit: 'USD',
        },
        budgetName: 'BudgetReport',
        costTypes: {
          includeCredit: false,
          includeDiscount: false,
          includeOtherSubscription: false,
          includeRecurring: false,
          includeRefund: false,
          includeSubscription: false,
          includeSupport: false,
          includeTax: false,
          includeUpfront: false,
          useAmortized: false,
          useBlended: false,
        },
      },

      notificationsWithSubscribers: [{
        notification: {
          comparisonOperator: 'GREATER_THAN',
          notificationType: 'FORECASTED',
          threshold: 100,
          thresholdType: 'PERCENTAGE',
        },
        subscribers: [{
          address: budgetNotification.topicArn,
          subscriptionType: 'SNS',
        }],
      }],
    });

    // BudgetLambda
    const budgetUpdaterFn = new NodejsFunction(this, 'BudgetLambda', {
      entry: path.join(__dirname, '..', 'functions', 'budget-updater.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_16_X,
      timeout: Duration.minutes(1),
      environment: {
        STACK_NAME: Stack.of(this).stackName,
      },
    });

    (budgetUpdaterFn.node.defaultChild as lambda.CfnFunction).overrideLogicalId('BudgetLambda');

    const costExplorerGetCostAndUsage = new iam.PolicyStatement({
      actions: ['ce:GetCostAndUsage'],
      resources: ['*'],
      effect: iam.Effect.ALLOW,
    });

    const budgetsModifyBudget = new iam.PolicyStatement({
      actions: ['budgets:ModifyBudget'],
      resources: [`arn:${Stack.of(this).partition}:budgets::${Stack.of(this).account}:budget/${budgetReport.logicalId}`],
      effect: iam.Effect.ALLOW,
    });

    const cloudformationUpdateStack = new iam.PolicyStatement({
      actions: ['cloudformation:UpdateStack'],
      resources: [Stack.of(this).stackId],
      effect: iam.Effect.ALLOW,
    });

    budgetUpdaterFn.role!.attachInlinePolicy(
      new iam.Policy(this, 'budget-updater-function', {
        statements: [
          costExplorerGetCostAndUsage,
          budgetsModifyBudget,
          cloudformationUpdateStack,
        ],
      }),
    );

    const rule = new Rule(this, 'ScheduleBudgetNotification', {
      // cron(0 0 L * ? *)
      schedule: Schedule.cron({
        minute: '0',
        hour: '0',
        day: 'L',
        month: '*',
        // weekDay: '?', //  Cannot supply both 'day' and 'weekDay', use at most one
        year: '*',
      }),
    });

    rule.addTarget(new LambdaFunction(budgetUpdaterFn));

    // BudgetAlarm
    const budgetAlarm = new cloudwatch.Alarm(this, 'BudgetAlarm', {
      alarmDescription: 'Superwerker default budget forecast exceed previous three months',
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 1,
      metric: new cloudwatch.Metric({
        metricName: 'NumberOfMessagesPublished',
        namespace: 'AWS/SNS',
        dimensionsMap: {
          TopicName: budgetNotification.topicName,
        },
        period: Duration.seconds(300),
        statistic: 'sum',
      }),
      threshold: 0,
      treatMissingData: cloudwatch.TreatMissingData.MISSING,
    });
    (budgetAlarm.node.defaultChild as cloudwatch.CfnAlarm).overrideLogicalId('BudgetAlarm');

    // Alarm Action creating SSM OpsItem
    budgetAlarm.addAlarmAction(
      new cloudwatch_actions.SsmAction(
        cloudwatch_actions.OpsItemSeverity.MEDIUM,
        cloudwatch_actions.OpsItemCategory.COST,
      ),
    );

  }
}
