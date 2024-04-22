import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { handler } from '../../src/functions/workmail-user.on-event-handler';
import { SSMClient, PutParameterCommand, DeleteParameterCommand } from '@aws-sdk/client-ssm';
import {
  WorkMailClient,
  CreateUserCommand,
  ListUsersCommand,
  RegisterToWorkMailCommand,
  DeregisterFromWorkMailCommand,
  DeleteUserCommand,
} from '@aws-sdk/client-workmail';

const ssmClientMock = mockClient(SSMClient);
const workmailClientMock = mockClient(WorkMailClient);
jest.mock('uuid', () => ({ v4: () => '123123123' }));

describe('workmail-user.on-event-handler', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    ssmClientMock.reset();
    workmailClientMock.reset();
  });

  it('creates SSM parameter & workmail user on "create" event', async () => {
    workmailClientMock.on(CreateUserCommand).resolves({ UserId: 'userid123' });

    const event = {
      RequestType: 'Create',
      ServiceToken: 'arn:aws:lambda:eu-central-1:123123:function:xxx',
      ResponseURL: '...',
      StackId: 'arn:aws:cloudformation:eu-central-1:123123:stack/xxx',
      RequestId: 'myRequestId123123',
      LogicalResourceId: 'WorkmailUser123',
      ResourceType: 'Custom::WorkmailUser',
      ResourceProperties: {
        ServiceToken: 'arn:aws:lambda:eu-central-1:123123:function:xxx',
        Domain: 'aws.testdomain.com',
        PasswordParamName: '/superwerker/rootmail_password',
        WorkmailOrgId: 'm-123123',
      },
    } as unknown as AWSLambda.CloudFormationCustomResourceEvent;

    const result = await handler(event);

    expect(ssmClientMock).toReceiveCommandWith(PutParameterCommand, {
      Name: '/superwerker/rootmail_password',
      Description: 'Password for superwerker root user in Workmail',
      Value: '123123123',
      Type: 'SecureString',
      Overwrite: false,
      Tier: 'Standard',
    });

    expect(workmailClientMock).toReceiveCommandWith(CreateUserCommand, {
      OrganizationId: 'm-123123',
      Name: 'root',
      DisplayName: 'root',
      Password: '123123123',
      Role: 'USER',
    });

    expect(workmailClientMock).toReceiveCommandWith(RegisterToWorkMailCommand, {
      OrganizationId: 'm-123123',
      EntityId: 'userid123',
      Email: 'root@aws.testdomain.com',
    });

    expect(result).toMatchObject({
      PhysicalResourceId: 'userid123',
    });
  });

  it('deletes workmail user & SSM parameter when receiving "delete" event', async () => {
    const event = {
      RequestType: 'Delete',
      ServiceToken: 'arn:aws:lambda:eu-central-1:123123:function:xxx',
      ResponseURL: '...',
      StackId: 'arn:aws:cloudformation:eu-central-1:123123:stack/xxx',
      RequestId: 'myRequestId123123',
      PhysicalResourceId: 'userid123',
      LogicalResourceId: 'WorkmailUser123',
      ResourceType: 'Custom::WorkmailUser',
      ResourceProperties: {
        ServiceToken: 'arn:aws:lambda:eu-central-1:123123:function:xxx',
        Domain: 'aws.testdomain.com',
        PasswordParamName: '/superwerker/rootmail_password',
        WorkmailOrgId: 'm-123123',
      },
    } as unknown as AWSLambda.CloudFormationCustomResourceEvent;

    const result = await handler(event);

    expect(workmailClientMock).toHaveReceivedCommandWith(DeregisterFromWorkMailCommand, {
      OrganizationId: 'm-123123',
      EntityId: 'userid123',
    });

    expect(workmailClientMock).toHaveReceivedCommandWith(DeleteUserCommand, {
      OrganizationId: 'm-123123',
      UserId: 'userid123',
    });

    expect(ssmClientMock).toHaveReceivedCommandWith(DeleteParameterCommand, {
      Name: '/superwerker/rootmail_password',
    });

    expect(result).toMatchObject({
      PhysicalResourceId: 'userid123',
    });
  });

  it('does not do anything on "update" event when user exists', async () => {
    workmailClientMock.on(ListUsersCommand).resolves({
      Users: [
        {
          Id: 'userid123',
          Email: 'root@aws.testdomain.com',
          Name: 'root',
          DisplayName: 'root',
        },
      ],
    });

    const event = {
      RequestType: 'Update',
      ServiceToken: 'arn:aws:lambda:eu-central-1:123123:function:xxx',
      ResponseURL: '...',
      StackId: 'arn:aws:cloudformation:eu-central-1:123123:stack/xxx',
      RequestId: 'myRequestId123123',
      PhysicalResourceId: 'userid123',
      LogicalResourceId: 'WorkmailUser123',
      ResourceType: 'Custom::WorkmailUser',
      ResourceProperties: {
        ServiceToken: 'arn:aws:lambda:eu-central-1:123123:function:xxx',
        Domain: 'aws.testdomain.com',
        PasswordParamName: '/superwerker/rootmail_password',
        WorkmailOrgId: 'm-123123',
      },
    } as unknown as AWSLambda.CloudFormationCustomResourceEvent;

    const result = await handler(event);

    expect(workmailClientMock).not.toHaveReceivedCommand(CreateUserCommand);

    expect(result).toMatchObject({
      PhysicalResourceId: 'userid123',
    });
  });
});
