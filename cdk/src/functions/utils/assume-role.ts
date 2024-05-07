import { AssumeRoleCommand, STS } from '@aws-sdk/client-sts';

export async function getCredsFromAssumeRole(stsClient: STS, roleArn: string, roleSessionName: string) {
  try {
    const command = new AssumeRoleCommand({
      RoleArn: roleArn,
      RoleSessionName: roleSessionName,
      DurationSeconds: 900,
    });
    const response = await stsClient.send(command);
    return {
      accessKeyId: response.Credentials!.AccessKeyId!,
      secretAccessKey: response.Credentials!.SecretAccessKey!,
      sessionToken: response.Credentials!.SessionToken!,
    };
  } catch (error) {
    console.log(error);
    throw new Error(`Failed to assume role ${roleArn}: ${error}`);
  }
}
