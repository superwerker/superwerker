import { STS, AssumeRoleCommand } from '@aws-sdk/client-sts';
import { mockClient } from 'aws-sdk-client-mock';
import { getCredsFromAssumeRole } from '../../../src/functions/utils/assume-role';

const stsClientMock = mockClient(STS);
const stsClient = new STS({});

describe('getCredsFromAssumeRole', () => {
  const roleArn = 'arn:aws:iam::11223344556677:role/MyRole';
  const roleSessionName = 'MySession';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return credentials when assume role succeeds', async () => {
    stsClientMock.on(AssumeRoleCommand).resolves({
      Credentials: {
        AccessKeyId: 'ACCESS_KEY_ID',
        SecretAccessKey: 'SECRET_ACCESS_KEY',
        SessionToken: 'SESSION_TOKEN',
        Expiration: new Date(),
      },
    });

    const result = await getCredsFromAssumeRole(stsClient, roleArn, roleSessionName);

    expect(result).toEqual({
      accessKeyId: 'ACCESS_KEY_ID',
      secretAccessKey: 'SECRET_ACCESS_KEY',
      sessionToken: 'SESSION_TOKEN',
    });
  });

  it('should throw error when assume role fails', async () => {
    stsClientMock.on(AssumeRoleCommand).rejects(new Error('Internal Error'));

    await expect(getCredsFromAssumeRole(stsClient, roleArn, roleSessionName)).rejects.toThrow(
      `Failed to assume role ${roleArn}: Error: Internal Error`,
    );
  });
});
