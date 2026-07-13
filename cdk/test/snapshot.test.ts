import { App, NestedStack, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { BUNDLING_STACKS } from 'aws-cdk-lib/cx-api';

import { SuperwerkerStack } from '../src/stacks/superwerker';

// Covers CDK-managed lambdas (provider framework, log retention) too, so a runtime only changes
// here deliberately - including when it changes because aws-cdk-lib was upgraded.
const EXPECTED_RUNTIMES = ['nodejs24.x', 'python3.14'];

// Masked: asset hashes vary by machine; the org-access physical resource id comes from Date.now()
// at synth time (backup.ts).
const stabilize = (template: object): object =>
  JSON.parse(
    JSON.stringify(template)
      .replace(/[a-f0-9]{64}/g, 'ASSET_HASH')
      .replace(/\\"id\\":\\"\d{13}\\"/g, '\\"id\\":\\"SYNTH_TIMESTAMP\\"'),
  );

// Bundling needs esbuild and Docker, and is not what these assertions are about.
const app = new App({ context: { [BUNDLING_STACKS]: [] } });
const superwerkerStack = new SuperwerkerStack(app, 'SuperwerkerStack', { version: '0.0.0-TEST' });

const nestedStacks = superwerkerStack.node.findAll().filter((construct): construct is NestedStack => NestedStack.isNestedStack(construct));

const allStacks: [string, Stack][] = [
  ['SuperwerkerStack', superwerkerStack],
  ...nestedStacks.map((stack): [string, Stack] => [stack.node.path, stack]),
];

describe('templates', () => {
  test.each(allStacks)('%s matches snapshot', (_name, stack) => {
    expect(stabilize(Template.fromStack(stack).toJSON())).toMatchSnapshot();
  });
});

describe('lambda runtimes', () => {
  const runtimes = allStacks.flatMap(([name, stack]) =>
    Object.entries(Template.fromStack(stack).findResources('AWS::Lambda::Function')).map(([logicalId, resource]): [string, string] => [
      `${name}/${logicalId}`,
      resource.Properties.Runtime,
    ]),
  );

  // Snapshotted separately so a runtime upgrade is a short readable diff, not buried in the templates.
  test('inventory matches snapshot', () => {
    expect(Object.fromEntries(runtimes.sort())).toMatchSnapshot();
  });

  test('every lambda uses an expected runtime', () => {
    expect(runtimes.length).toBeGreaterThan(0);

    const unexpected = runtimes.filter(([, runtime]) => !EXPECTED_RUNTIMES.includes(runtime));
    expect(unexpected).toEqual([]);
  });
});
