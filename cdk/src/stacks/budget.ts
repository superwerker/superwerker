import {
  NestedStack,
  NestedStackProps,
  aws_sns as sns,
  aws_iam as iam,
  aws_cloudwatch as cw,
  aws_cloudwatch_actions as actions,
  aws_budgets as budgets,
} from 'aws-cdk-lib';
import { CfnBudget } from 'aws-cdk-lib/aws-budgets';
import { Alias } from 'aws-cdk-lib/aws-kms';
import { CfnTopic } from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';

export class BudgetStack extends NestedStack {
  constructor(scope: Construct, id: string, props: NestedStackProps) {
    super(scope, id, props);

    const aws_sns_kms = Alias.fromAliasName(this, 'aws-managed-sns-kms-key', 'alias/aws/sns');

    const budgetNotificationTopic = new sns.Topic(this, 'BudgetNotification', {
      masterKey: aws_sns_kms,
    });
    (budgetNotificationTopic.node.defaultChild as CfnTopic).overrideLogicalId('BudgetNotification');

    const snsTopicPolicy = new sns.TopicPolicy(this, 'BudgetNotificationPolicy', {
      policyDocument: new iam.PolicyDocument({
        statements: [
          new iam.PolicyStatement({
            actions: ['sns:Publish'],
            effect: iam.Effect.ALLOW,
            principals: [new iam.ServicePrincipal('budgets.amazonaws.com')],
            resources: [budgetNotificationTopic.topicArn],
          }),
        ],
      }),
      topics: [budgetNotificationTopic],
    });
    (snsTopicPolicy.node.defaultChild as CfnTopic).overrideLogicalId('BudgetNotificationPolicy');

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
    (budgetAlarm.node.defaultChild as CfnBudget).overrideLogicalId('BudgetAlarm');

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
