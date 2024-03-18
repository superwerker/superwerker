import * as path from 'path';
import { App, Stack, StackProps } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { CfnInclude } from 'aws-cdk-lib/cloudformation-include';
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

describe('resources', () => {
  const app = new App({});
  const originalStack = new OriginalStack(app, 'original', {});
  const underTestStack = new UnderTestStack(app, 'stack', {}).inner;
  const expectedResources = Template.fromStack(originalStack).toJSON().Resources as { [key: string]: { [key: string]: any } };
  const underTestResources = Template.fromStack(underTestStack).toJSON().Resources as { [key: string]: { [key: string]: any } };

  test('If the new stack has the same number of resources as the original stack', () => {
    expect(Object.keys(underTestResources).length).toEqual(Object.keys(expectedResources).length);
  });

  test('Compare corresponding resources in the Original and the Under Test Stack', () => {
    /* Compare each of the expected resources against that of the under test resources inside the nested loop.
    Conditional check applied on the Type of the resource to avoid non-required comparisons.
    */
    for (let [resourceOriginal, resourcePropsOriginal] of Object.entries(expectedResources)) {
      for (let [resourceUnderTest, resourcePropsUnderTest] of Object.entries(underTestResources)) {
        //check if the current property type for both the resource maps (Expected and Under Test) are same.
        console.log(resourceUnderTest);
        if (resourcePropsOriginal.Type == resourcePropsUnderTest.Type) {
          // check that conditions match the original ones
          if (resourcePropsOriginal.Condition) {
            expect(Template.fromStack(underTestStack).toJSON().Resources).toHaveProperty(
              [resourceOriginal, 'Condition'],
              resourcePropsOriginal.Condition,
            );
          }

          // check that dependsOn match the original ones
          if (resourcePropsOriginal.DependsOn) {
            expect(Template.fromStack(underTestStack).toJSON().Resources).toHaveProperty(
              [resourceOriginal, 'DependsOn'],
              resourcePropsOriginal.DependsOn,
            );
          }

          // check that parameters match the original ones
          if (resourcePropsOriginal.Properties != null && resourcePropsOriginal.Properties.Parameters) {
            for (const param of Object.keys(resourcePropsOriginal.Properties.Parameters)) {
              expect(Template.fromStack(underTestStack).toJSON().Resources).toHaveProperty([
                resourceOriginal,
                'Properties',
                'Parameters',
                param,
              ]);
            }
          }

          expect(resourceUnderTest).toContain(resourceOriginal);
        }
      }
    }
  });
});
