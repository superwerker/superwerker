import {
  GetAccountSendingEnabledCommand,
  GetIdentityDkimAttributesCommand,
  GetIdentityNotificationAttributesCommand,
  GetIdentityVerificationAttributesCommand,
  SESClient,
} from '@aws-sdk/client-ses';
import { PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { CdkCustomResourceEvent, Context } from 'aws-lambda';
export const PROP_DOMAIN = 'Domain';
export const PROP_PARAM_NAME = 'PropagationParamName';

const SES = new SESClient({ region: 'eu-west-1' });
const SSM = new SSMClient();

export interface IsCompleteHandlerResponse {
  IsComplete: boolean;
}

export async function handler(event: CdkCustomResourceEvent, _context: Context): Promise<IsCompleteHandlerResponse> {
  const domain = event.ResourceProperties[PROP_DOMAIN];
  const propagationParamName = event.ResourceProperties[PROP_PARAM_NAME];

  switch (event.RequestType) {
    case 'Create':
      const isReady = await internalHandler(domain);
      if (isReady) {
        await SSM.send(new PutParameterCommand({ Name: propagationParamName, Value: 'done', Overwrite: true }));
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

async function internalHandler(domain: string): Promise<boolean> {
  log({
    domain: domain,
    level: 'debug',
  });

  const sendingResponse = await SES.send(new GetAccountSendingEnabledCommand({}));
  if (!sendingResponse.Enabled) {
    return false;
  }
  log('sending enabled');

  const identityVerificationResponse = await SES.send(new GetIdentityVerificationAttributesCommand({ Identities: [domain] }));
  if (
    !identityVerificationResponse.VerificationAttributes ||
    identityVerificationResponse.VerificationAttributes[domain].VerificationStatus !== 'Success'
  ) {
    return false;
  }
  log('identity verification successful');

  const identityDkimRes = await SES.send(new GetIdentityDkimAttributesCommand({ Identities: [domain] }));
  if (!identityDkimRes.DkimAttributes || identityDkimRes.DkimAttributes[domain].DkimVerificationStatus !== 'Success') {
    return false;
  }
  log('DKIM verification successful');

  const identityNotificationRes = await SES.send(new GetIdentityNotificationAttributesCommand({ Identities: [domain] }));
  if (!identityNotificationRes.NotificationAttributes || !identityNotificationRes.NotificationAttributes[domain].ForwardingEnabled) {
    return false;
  }
  log('forwarding enabled');

  return true;
}
