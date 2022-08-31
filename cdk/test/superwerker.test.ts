import * as path from 'path';
import { App, Stack, StackProps } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { CfnInclude } from 'aws-cdk-lib/cloudformation-include';
import { Construct } from 'constructs';
import { SuperwerkerStack } from '../src/superwerker';

export class OriginalStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);
    new CfnInclude(this, 'SuperwerkerTemplate', {
      templateFile: path.join(__dirname, '..', '..', 'templates', 'superwerker.template.yaml'),
    });
  }
}

describe('parameters', () => {
  const app = new App();
  const originalStack = new OriginalStack(app, 'original', {});
  const stack = new SuperwerkerStack(app, 'stack', {});
  const expectedParameters = Template.fromStack(originalStack).toJSON().Parameters as {[key:string]: {[key:string]: string}};
  test.each(Object.entries(expectedParameters))('parameter: %p', (param, value) => {
    Template.fromStack(stack).hasParameter(param, value);
  });
});
