import { CreateOrganizationCommand, DeleteOrganizationCommand, ListOrganizationsCommand, WorkMailClient } from '@aws-sdk/client-workmail';
import { v4 as uuidv4 } from 'uuid';
export const PROP_DOMAIN = 'Domain';
export const PROP_PARAM_NAME = 'PropagationParamName';
export const PROP_HOSTED_ZONE_ID = 'HostedZoneId';

const workmail = new WorkMailClient({ region: 'eu-west-1' });

export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent) {
  const domain = event.ResourceProperties[PROP_DOMAIN];
  const hostedZoneId = event.ResourceProperties[PROP_HOSTED_ZONE_ID];

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      console.log(`${event.RequestType} Workmail organization. PhysicalResourceId: ${event.RequestId}`);

      if (event.RequestType === 'Update') {
        // Check if Workmail Organization exists
        const orgList = await workmail.send(new ListOrganizationsCommand({}));

        for (const org of orgList.OrganizationSummaries!) {
          if (org.OrganizationId == event.PhysicalResourceId && org.DefaultMailDomain == domain) {
            console.log('Workmail organization already exists, do nothing.');
            return {
              PhysicalResourceId: event.PhysicalResourceId,
              Data: {
                workmailOrgId: event.PhysicalResourceId,
              },
            };
          }
        }
      }

      console.log('Creating new workmail organization');
      const command = new CreateOrganizationCommand({
        Alias: uuidv4(),
        Domains: [
          {
            DomainName: domain,
            HostedZoneId: hostedZoneId,
          },
        ],
        EnableInteroperability: false,
      });

      const response = await workmail.send(command);

      return {
        PhysicalResourceId: response.OrganizationId,
        Data: {
          workmailOrgId: response.OrganizationId,
        },
      };

    case 'Delete':
      console.log(`${event.RequestType} Workmail organization custom resource. PhysicalResourceId: ${event.PhysicalResourceId}`);

      console.log(`Deleting Workmail organization ${event.PhysicalResourceId}`);
      await workmail
        .send(
          new DeleteOrganizationCommand({
            OrganizationId: event.PhysicalResourceId,
            DeleteDirectory: true,
            ForceDelete: false,
          }),
        )
        .catch(function (error) {
          console.error('Error when deleting workmail organization', error);
        });

      return {
        PhysicalResourceId: event.PhysicalResourceId,
      };
  }
}
