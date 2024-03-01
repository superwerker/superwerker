import * as path from 'path';
import { App, Stack, StackProps } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { CfnInclude } from 'aws-cdk-lib/cloudformation-include';
import { BUNDLING_STACKS } from 'aws-cdk-lib/cx-api';
import { Construct } from 'constructs';
import { GuardDutyStack } from '../src/stacks/guardduty';

export class UnderTestStack extends Stack {
  public readonly inner: Stack;
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);
    this.inner = new GuardDutyStack(this, 'stack', {});
  }
}

export class OriginalStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);
    new CfnInclude(this, 'GuarddutyTemplate', {
      templateFile: path.join(__dirname, '..', '..', 'templates', 'guardduty.yaml'),
    });
  }
}

// Disable asset bundling while testing.
// This context needs to be passed to all instances of cdk.App in the test case.
const context = {
  [BUNDLING_STACKS]: [],
};

describe('resources', () => {
  const app = new App({ context });
  const originalStack = new OriginalStack(app, 'original', {});
  const stack = new UnderTestStack(app, 'stack', {}).inner;
  const expectedResources = Template.fromStack(originalStack).toJSON().Resources as { [key: string]: { [key: string]: any } };

  // Ignore the original resources for generating an email
  for (const key in expectedResources) {
    if (key.startsWith('Generate')) delete expectedResources[key];
  }

  test.each(Object.entries(expectedResources))('resource: %p', (resource, resourceProps) => {
    // This sucks. Unfortunately we can't just call 'hasResource('myLogicalId').
    // TODO: make this better, either extend Template to have a better matcher or come up with a helper method.
    // Maybe like this: https://www.emgoto.com/jest-partial-match/
    // https://cdk-dev.slack.com/archives/C018XT6REKT/p1662017721195839
    // For now we just check that the logical id and the condition are the same


    // check that conditions match the original ones
    if (resourceProps.Condition) {
      expect(Template.fromStack(stack).toJSON().Resources).toHaveProperty([resource, 'Condition'], resourceProps.Condition);
    }

    // check that dependsOn match the original ones
    if (resourceProps.DependsOn) {
      expect(Template.fromStack(stack).toJSON().Resources).toHaveProperty([resource, 'DependsOn'], resourceProps.DependsOn);
    }

    // check that parameters match the original ones
    if (resourceProps.Properties.Parameters) {
      for (const param of Object.keys(resourceProps.Properties.Parameters)) {
        expect(Template.fromStack(stack).toJSON().Resources).toHaveProperty([resource, 'Properties', 'Parameters', param]);
      }
    }

    expect(Template.fromStack(stack).toJSON().Resources).toHaveProperty(resource);
  });
});