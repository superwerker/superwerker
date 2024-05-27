import { setTimeout } from 'timers/promises';
import { SSMClient, DeleteParameterCommand, PutParameterCommand } from '@aws-sdk/client-ssm';
import {
  WorkMailClient,
  DeleteUserCommand,
  DeregisterFromWorkMailCommand,
  ListUsersCommand,
  CreateUserCommand,
  RegisterToWorkMailCommand,
} from '@aws-sdk/client-workmail';
import { ExchangeService, WebCredentials, Uri, ExchangeVersion, Rule, CreateRuleOperation } from 'ews-javascript-api';
import { v4 as uuidv4 } from 'uuid';
export const PROP_DOMAIN = 'Domain';
export const PROP_PASSWORD_PARAM = 'PasswordParamName';
export const PROP_ORG_ID = 'WorkmailOrgId';
export const PROP_NOTIF_EMAIL = 'NotificationsMail';

const workmail = new WorkMailClient({ region: 'eu-west-1' });
const ssm = new SSMClient();

export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent) {
  const domain = event.ResourceProperties[PROP_DOMAIN];
  const workmailOrgId = event.ResourceProperties[PROP_ORG_ID];
  const passwordParam = event.ResourceProperties[PROP_PASSWORD_PARAM];
  const notificationEmail = event.ResourceProperties[PROP_NOTIF_EMAIL];

  console.log(event);

  switch (event.RequestType) {
    case 'Update':
    case 'Create':
      console.log(`${event.RequestType} Workmail user. PhysicalResourceId: ${event.RequestId}`);

      if (event.RequestType === 'Update') {
        // Check if Workmail User exists
        const userList = await workmail.send(
          new ListUsersCommand({
            OrganizationId: workmailOrgId,
            Filters: {
              UsernamePrefix: 'root',
              PrimaryEmailPrefix: 'root',
            },
          }),
        );

        for (const user of userList.Users!) {
          if (user.Email == `root@${domain}`) {
            console.log('Workmail user already exists, do nothing.');
            return {
              PhysicalResourceId: user.Id,
            };
          }
        }
      }

      const userEmail = `root@${domain}`;
      const tempPass = uuidv4();

      console.log('Store temp password in SSM parameter');
      await ssm.send(
        new PutParameterCommand({
          Name: passwordParam,
          Description: 'Password for superwerker root user in Workmail',
          Value: tempPass,
          Type: 'SecureString',
          Overwrite: false,
          Tier: 'Standard',
        }),
      );

      console.log('Create new workmail user');
      const userResponse = await workmail.send(
        new CreateUserCommand({
          OrganizationId: workmailOrgId,
          Name: 'root',
          DisplayName: 'root',
          Password: tempPass,
          Role: 'USER',
        }),
      );
      console.log(userResponse);

      console.log('Register the new workmail user');
      await workmail.send(
        new RegisterToWorkMailCommand({
          OrganizationId: workmailOrgId,
          EntityId: userResponse.UserId,
          Email: userEmail,
        }),
      );

      if (notificationEmail != '') {
        console.log(`Set redirect rule to ${notificationEmail}`);
        await setRedirectRule(notificationEmail, tempPass, userEmail);
      } else {
        console.log('NotificationEmail is empty. Skip creation of redirect rule.');
      }

      return {
        PhysicalResourceId: userResponse.UserId,
      };

    case 'Delete':
      console.log(`${event.RequestType} Workmail user. PhysicalResourceId: ${event.PhysicalResourceId}`);

      await workmail.send(
        new DeregisterFromWorkMailCommand({
          OrganizationId: workmailOrgId,
          EntityId: event.PhysicalResourceId,
        }),
      );

      await workmail.send(
        new DeleteUserCommand({
          OrganizationId: workmailOrgId,
          UserId: event.PhysicalResourceId,
        }),
      );

      console.log(`Deleting SSM parameter ${passwordParam}`);

      await ssm.send(
        new DeleteParameterCommand({
          Name: passwordParam,
        }),
      );

      return {
        PhysicalResourceId: event.PhysicalResourceId,
      };
  }
}

async function setRedirectRule(notificationEmail: string, password: string, user: string) {
  // TODO: implement a check to see if the workmail server can already be connected,
  // and remove this wait time
  await setTimeout(10000); // wait to ensure workmail user has been configured

  console.log('Setting up connection');
  const exch = new ExchangeService(ExchangeVersion.Exchange2010_SP2);
  exch.Credentials = new WebCredentials(user, password);
  exch.Url = new Uri('https://ews.mail.eu-west-1.awsapps.com/EWS/Exchange.asmx');

  const rule = new Rule();
  rule.DisplayName = 'Redirect all mails';
  rule.Priority = 1;
  rule.IsEnabled = true;
  rule.Conditions.ContainsSenderStrings.Add('@');
  rule.Actions.RedirectToRecipients.Add(notificationEmail);

  console.log('Create inbox rule');
  const ruleOperation = new CreateRuleOperation(rule);
  await exch.UpdateInboxRules([ruleOperation], true);
}
