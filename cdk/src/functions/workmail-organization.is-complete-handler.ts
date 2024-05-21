import { PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import {
  DescribeOrganizationCommand,
  GetMailDomainCommand,
  UpdateDefaultMailDomainCommand,
  WorkMailClient,
} from '@aws-sdk/client-workmail';
import { CdkCustomResourceIsCompleteEvent } from 'aws-lambda';
export const PROP_DOMAIN = 'Domain';
export const PROP_PARAM_NAME = 'PropagationParamName';

const workmail = new WorkMailClient({ region: 'eu-west-1' });
const SSM = new SSMClient();

export async function handler(event: CdkCustomResourceIsCompleteEvent) {
  const domain = event.ResourceProperties[PROP_DOMAIN];
  const propagationParamName = event.ResourceProperties[PROP_PARAM_NAME];
  const workmailOrgId = event.PhysicalResourceId!;

  switch (event.RequestType) {
    case 'Create':
      const isReady = await internalHandler(workmailOrgId, domain);
      if (isReady) {
        log('Organization and domain are ready, updating SSM parameter');
        await SSM.send(new PutParameterCommand({ Name: propagationParamName, Value: 'done', Overwrite: true }));
        log('Set new domain as default');
        await workmail.send(
          new UpdateDefaultMailDomainCommand({
            OrganizationId: workmailOrgId,
            DomainName: domain,
          }),
        );
      }
      return { IsComplete: isReady };

    case 'Update':
    case 'Delete':
      return {
        IsComplete: true,
      };
  }
}

function log(msg: any) {
  console.log(JSON.stringify(msg));
}

async function internalHandler(workmailOrgId: string, domain: string): Promise<boolean> {
  log({
    domain: domain,
    level: 'debug',
  });

  // Check if the Workmail organization status is active
  const orgResponse = await workmail.send(new DescribeOrganizationCommand({ OrganizationId: workmailOrgId }));
  if (orgResponse.State !== 'Active') {
    return false;
  }
  log('Workmail organization is active');

  // Check if the domain is verified
  const domainResponse = await workmail.send(
    new GetMailDomainCommand({
      OrganizationId: workmailOrgId,
      DomainName: domain,
    }),
  );

  if (domainResponse.DkimVerificationStatus !== 'VERIFIED' || domainResponse.OwnershipVerificationStatus !== 'VERIFIED') {
    return false;
  }
  log('Domain is verified');

  return true;
}
