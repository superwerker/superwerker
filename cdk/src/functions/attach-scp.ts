import AWS from 'aws-sdk';
import { BackOffPolicy, Retryable } from 'typescript-retry-decorator';

const organizations = new AWS.Organizations();

const CREATE = 'Create';
const UPDATE = 'Update';
const DELETE = 'Delete';
const SCP = 'SERVICE_CONTROL_POLICY';

export const POLICY = 'Policy';
export const ATTACH = 'Attach';


async function root() {
  const roots = await organizations.listRoots().promise();
  return roots.Roots![0];
}

export async function rootId() {
  return (await root()).Id!;
}

class RetryableFn {
  @Retryable({
    maxAttempts: 5,
    backOffPolicy: BackOffPolicy.ExponentialBackOffPolicy,
    backOff: 1000,
    exponentialOption: { maxInterval: 4000, multiplier: 3 },
  })
  static async withRetry<T>(
    fn: {
      (...fnArgs: any[]): {
        promise: () => Promise<T>;
      };
    },
    ...args: any[]
  ): Promise<T> {
    return fn(...args).promise();
  }
}

export async function policyAttached(policyId: string): Promise<boolean> {
  const result = await organizations.listPoliciesForTarget({
    TargetId: await rootId(),
    Filter: SCP,
  }).promise();

  return result.Policies?.some(
    p => p.Id == policyId,
  ) ?? false;
}

export async function handler(event: any, _context: any) {
  const requestType = event.RequestType;
  const properties = event.ResourceProperties;
  const logicalResourceId = event.LogicalResourceId;
  const physicalResourceId = event.PhysicalResourceId;
  const policy = properties[POLICY];
  const attach = properties[ATTACH];

  const parameters = {
    Content: policy,
    Description: `superwerker - ${logicalResourceId}`,
    Name: 'superwerker',
  };

  const policyId = physicalResourceId;

  switch (requestType) {
    case CREATE:
      console.log(`Creating Policy: ${logicalResourceId}`);
      const response = await RetryableFn.withRetry(
        organizations.createPolicy, {
          ...parameters,
          Type: SCP,
        },
      );
      const createdPolicyId = response.Policy!.PolicySummary!.Id!;
      if (attach) {
        await RetryableFn.withRetry(
          organizations.attachPolicy, {
            PolicyId: createdPolicyId,
            TargetId: await rootId(),
          },
        );
      }
      break;
    case UPDATE:
      console.log(`Updating Policy: ${logicalResourceId}`);
      await RetryableFn.withRetry(
        organizations.updatePolicy, {
          PolicyId: policyId,
          ...parameters,
        },
      );
      break;
    case DELETE:
      console.log(`Deleting Policy: ${logicalResourceId}`);
      // Same as above
      if (/p-[0-9a-z]+/.test(policyId)) {
        if (await policyAttached(policyId)) {
          await RetryableFn.withRetry(
            organizations.detachPolicy, {
              PolicyId: policyId,
              TargetId: await rootId(),
            },
          );
        }
        await RetryableFn.withRetry(
          organizations.deletePolicy, {
            PolicyId: policyId,
          },
        );
      } else {
        console.log(`${policyId} is no valid PolicyId`);
      }
      break;
    default:
      throw new Error(`Unexpected RequestType: ${requestType}`);
  }
  return {};
}
