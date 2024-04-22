// eslint-disable-next-line import/no-unresolved
import { SSMClient, PutParameterCommand, DeleteParameterCommand } from '@aws-sdk/client-ssm';
import {
  WorkMailClient,
  CreateUserCommand,
  RegisterToWorkMailCommand,
  DeleteUserCommand,
  DeregisterFromWorkMailCommand,
  ListUsersCommand,
} from '@aws-sdk/client-workmail';
import { v4 as uuidv4 } from 'uuid';
export const PROP_DOMAIN = 'Domain';
export const PROP_PASSWORD_PARAM = 'PasswordParamName';
export const PROP_ORG_ID = 'WorkmailOrgId';

const workmail = new WorkMailClient({ region: 'eu-west-1' });
const ssm = new SSMClient();

export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent) {
  const domain = event.ResourceProperties[PROP_DOMAIN];
  const workmailOrgId = event.ResourceProperties[PROP_ORG_ID];
  const passwordParam = event.ResourceProperties[PROP_PASSWORD_PARAM];

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

      const tempPass = uuidv4();

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

      await workmail.send(
        new RegisterToWorkMailCommand({
          OrganizationId: workmailOrgId,
          EntityId: userResponse.UserId,
          Email: `root@${domain}`,
        }),
      );

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
