import AWS from 'aws-sdk';
import { BackOffPolicy, Retryable } from 'typescript-retry-decorator';

const organizations = new AWS.Organizations();

const CREATE = 'Create';
const UPDATE = 'Update';
const DELETE = 'Delete';
const TAG_POLICY = 'TAG_POLICY';


class RetryableFn {
  @Retryable({
    maxAttempts: 5,
    backOffPolicy: BackOffPolicy.ExponentialBackOffPolicy,
    backOff: 1000,
    exponentialOption: { maxInterval: 4000, multiplier: 3 },
  })
  static async withRetry<T>(fn: {(...fnArgs: any[]): {promise: () => Promise<T>}}, ...args: any[]): Promise<T> {
    return fn(...args).promise();
  }
}

async function root() {
  return (await organizations.listRoots().promise()).Roots![0];
}


async function rootId(): Promise<string> {
  return (await root()).Id!;
}


async function policyAttached(policyId: string): Promise<boolean> {
  const result = await organizations.listPoliciesForTarget({
    TargetId: await rootId(),
    Filter: TAG_POLICY,
  }).promise();

  return result.Policies?.some(
    p => p.Id == policyId,
  ) ?? false;
}

export async function handler(event: any, _context: any) {
  const RequestType = event.RequestType;
  const Properties = event.ResourceProperties;
  const LogicalResourceId = event.LogicalResourceId;
  const PhysicalResourceId = event.PhysicalResourceId;
  const Policy = Properties.Policy;
  const Attach = Properties.Attach == 'true';

  const parameters = {
    Content: Policy,
    Description: `superwerker - ${LogicalResourceId}`,
    Name: LogicalResourceId,
  };

  const policyId = PhysicalResourceId!;

  switch (RequestType) {
    case CREATE:
      console.log(`Creating Policy: ${LogicalResourceId}`);
      const response = await RetryableFn.withRetry(
        organizations.createPolicy, {
          ...parameters,
          Type: TAG_POLICY,
        },
      );

      const createdPolicyId = response!.Policy!.PolicySummary!.Id!;
      if (Attach) {
        await RetryableFn.withRetry(organizations.attachPolicy, {
          PolicyId: createdPolicyId,
          TargetId: rootId(),
        });
      }
      break;
    case UPDATE:
      console.log(`Updating Policy: ${LogicalResourceId}`);
      await RetryableFn.withRetry(organizations.updatePolicy, {
        PolicyId: policyId,
        ...parameters,
      });
      break;
    case DELETE:
      console.log(`Deleting Policy: ${LogicalResourceId}`);
      // Same as above
      if (policyId.match(/p-[0-9a-z]/)) {
        if (await policyAttached(policyId)) {
          await RetryableFn.withRetry(
            organizations.detachPolicy, {
              PolicyId: policyId, TargetId: rootId(),
            },
          );
        }
        await RetryableFn.withRetry(organizations.deletePolicy, { PolicyId: policyId });
      } else {
        console.log(`${policyId} is no valid PolicyId`);
      }
      break;
    default:
      throw new Error(`Unexpected RequestType: ${RequestType}`);
  }
  return {};
}


