import {
  Change,
  ChangeAction,
  ChangeResourceRecordSetsCommand,
  ChangeResourceRecordSetsCommandOutput,
  RRType,
  Route53Client,
} from '@aws-sdk/client-route-53';
import {
  CreateOrganizationCommand,
  DeleteOrganizationCommand,
  GetMailDomainCommand,
  ListOrganizationsCommand,
  WorkMailClient,
} from '@aws-sdk/client-workmail';
import { v4 as uuidv4 } from 'uuid';
export const PROP_DOMAIN = 'Domain';
export const PROP_PARAM_NAME = 'PropagationParamName';
export const PROP_HOSTED_ZONE_ID = 'HostedZoneId';

const workmail = new WorkMailClient({ region: 'eu-west-1' });
const route53 = new Route53Client();

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

      console.log(`Deleting Workmail / SES DNS records from hosted zone ${hostedZoneId}`);
      const deleteResponse = await deleteDNSRecords(event.PhysicalResourceId!, hostedZoneId, domain).catch(function (error) {
        console.error('Error when deleting DNS records sets', error);
      });
      console.log('Delete response:', deleteResponse);

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

/*
 * Delete DNS records from Route53. Otherwise the hosted zone cannot be deleted.
 */
async function deleteDNSRecords(
  workmailOrgId: string,
  hostedZoneId: string,
  domain: string,
): Promise<ChangeResourceRecordSetsCommandOutput> {
  // Get DNS records from Workmail
  const workmail_domain = await workmail.send(
    new GetMailDomainCommand({
      OrganizationId: workmailOrgId,
      DomainName: domain,
    }),
  );

  // Parse the records for Route53 delete command input
  const changeRecords: Change[] = [];

  workmail_domain.Records!.forEach((record) => {
    let value = '';
    if (record.Type == 'TXT') {
      if (record.Hostname!.includes('_amazonses')) {
        value = `"${record.Value}"`;
        console.log('txt amazonses');
      } else {
        return;
      }
    } else {
      value = record.Value!;
    }

    const change_input = {
      Action: 'DELETE' as ChangeAction,
      ResourceRecordSet: {
        Name: record.Hostname!,
        Type: record.Type! as RRType,
        TTL: 600,
        ResourceRecords: [
          {
            Value: value,
          },
        ],
      },
    };

    changeRecords.push(change_input);
  });

  const deleteInput = {
    HostedZoneId: hostedZoneId,
    ChangeBatch: {
      Comment: 'Delete records from Workmail / SES',
      Changes: changeRecords,
    },
  };

  console.log('Delete input:', changeRecords);

  const deleteResponse = await route53.send(new ChangeResourceRecordSetsCommand(deleteInput));
  return deleteResponse;
}