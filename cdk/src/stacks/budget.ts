import {
  NestedStack,
  NestedStackProps,
  aws_sns as sns,
  aws_iam as iam,
  aws_cloudwatch as cw,
  aws_cloudwatch_actions as actions,
  aws_budgets as budgets,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class BudgetStack extends NestedStack {
  constructor(scope: Construct, id: string, props: NestedStackProps) {
    super(scope, id, props);

    const budgetNotificationTopic = new sns.Topic(this, 'BudgetNotification');

    const budgetNotificationPolicyStatement = new iam.PolicyStatement({
      actions: ['sns:Publish'],
      effect: iam.Effect.ALLOW,
      principals: [new iam.ServicePrincipal('budget.amazonaws.com')],
      resources: [budgetNotificationTopic.topicArn],
    });

    const budgetNotificationPolicyDocument = new iam.PolicyDocument({
      statements: [budgetNotificationPolicyStatement],
    });

    new sns.TopicPolicy(this, 'BudgetNotificationPolicy', {
      policyDocument: budgetNotificationPolicyDocument,
      topics: [budgetNotificationTopic],
    });

    const budgetAlarm = new cw.Alarm(this, 'BudgetAlarm', {
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
      alarmDescription: 'Superwerker default budget forecast exceed previous three months',
      evaluationPeriods: 1,
      threshold: 0,
      treatMissingData: cw.TreatMissingData.MISSING,
      metric: new cw.Metric({
        metricName: 'NumberOfMessagesPublished',
        namespace: 'AWS/SNS',
        dimensionsMap: {
          TopicName: budgetNotificationTopic.topicName,
        },
        statistic: cw.Stats.SUM,
      }),
    });

    budgetAlarm.addAlarmAction(new actions.SsmAction(actions.OpsItemSeverity.MEDIUM, actions.OpsItemCategory.COST));

    new budgets.CfnBudget(this, 'BudgetReport', {
      budget: {
        budgetType: 'COST',
        costTypes: {
          includeCredit: false,
          includeRefund: false,
        },
        timeUnit: 'MONTHLY',
        autoAdjustData: {
          autoAdjustType: 'HISTORICAL',
          historicalOptions: {
            budgetAdjustmentPeriod: 3,
          },
        },
      },
      notificationsWithSubscribers: [
        {
          notification: {
            comparisonOperator: 'GREATER_THAN',
            notificationType: 'FORECASTED',
            threshold: 105,
          },
          subscribers: [
            {
              subscriptionType: 'SNS',
              address: budgetNotificationTopic.topicArn,
            },
          ],
        },
      ],
    });
  }
}
