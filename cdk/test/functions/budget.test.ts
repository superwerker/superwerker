import * as path from 'path';
import { App, Stack, StackProps } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { CfnInclude } from 'aws-cdk-lib/cloudformation-include';
import { BUNDLING_STACKS } from 'aws-cdk-lib/cx-api';
import { Construct } from 'constructs';
import { BudgetStack } from '../../src/stacks/budget';

export class UnderTestStack extends Stack {
  public readonly inner: Stack;
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);
    this.inner = new BudgetStack(this, 'stack', {});
  }
}

export class OriginalStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);
    new CfnInclude(this, 'BudgetTemplate', {
      templateFile: path.join(__dirname, '..', '..', '..', 'templates', 'budget.yaml'),
    });
  }
}

const context = {
  [BUNDLING_STACKS]: [],
};

describe('resources', () => {
  const app = new App({ context });
  const stack = new UnderTestStack(app, 'stack', {}).inner;
  const template = Template.fromStack(stack);

  it('Check if SNS topic resource is present', () => {
    template.resourceCountIs('AWS::SNS::Topic', 1);
  });

  it('Check if Cloudwatch Alarm is present', () => {
    template.resourceCountIs('AWS::CloudWatch::Alarm', 1);
  });

  it('Check if Budget Notification Policy is created', () => {
    template.resourceCountIs('AWS::SNS::TopicPolicy', 1);
  });

  it('Check if Budget Report is created', () => {
    template.resourceCountIs('AWS::Budgets::Budget', 1);
  });
});
