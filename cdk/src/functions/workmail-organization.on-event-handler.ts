import { CreateOrganizationCommand, DeleteOrganizationCommand, ListOrganizationsCommand, WorkMailClient } from '@aws-sdk/client-workmail';
import { SESClient, CreateReceiptRuleSetCommand, SetActiveReceiptRuleSetCommand, DeleteReceiptRuleSetCommand } from '@aws-sdk/client-ses';
import { v4 as uuidv4 } from 'uuid';
export const PROP_DOMAIN = 'Domain';
export const PROP_PARAM_NAME = 'PropagationParamName';
export const PROP_HOSTED_ZONE_ID = 'HostedZoneId';

const workmail = new WorkMailClient({ region: 'eu-west-1' });
const ses = new SESClient({ region: 'eu-west-1' });

export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent) {
  const domain = event.ResourceProperties[PROP_DOMAIN];
  const hostedZoneId = event.ResourceProperties[PROP_HOSTED_ZONE_ID];
  const ruleSetName = 'RootMail-v2';

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

      // Create new SES RuleSet to avoid conflict with the old RootMail version
      await ses.send(
        new CreateReceiptRuleSetCommand({
          RuleSetName: ruleSetName,
        }),
      );
      await ses.send(
        new SetActiveReceiptRuleSetCommand({
          RuleSetName: ruleSetName,
        }),
      );

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

      await ses
        .send(
          new DeleteReceiptRuleSetCommand({
            RuleSetName: ruleSetName,
          }),
        )
        .catch(function (error) {
          console.error('Error when deleting SES ruleset', error);
        });

      return {
        PhysicalResourceId: event.PhysicalResourceId,
      };
  }
}
