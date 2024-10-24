import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as CloseOrgAccountsCdk from '../lib/close-org-accounts-cdk-stack';

test('Accounts closed successfully', () => {
  const app = new cdk.App();

  const stack = new CloseOrgAccountsCdk.CloseOrgAccountsCdkStack(app, 'MyTestStack');

  const template = Template.fromStack(stack);

  template.hasResourceProperties("AWS::Lambda::Function",{
    Handler: "index.handler",
    Runtime: "python3.9"
  });
});
