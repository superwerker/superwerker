// eslint-disable-next-line import/no-unresolved
import { SESClient, VerifyDomainDkimCommand, VerifyDomainIdentityCommand } from '@aws-sdk/client-ses';
import { CdkCustomResourceEvent, CloudFormationCustomResourceUpdateEvent, CdkCustomResourceResponse, Context } from 'aws-lambda';
export const PROP_DOMAIN = 'Domain';
export const ATTR_VERIFICATION_TOKEN = 'VerificationToken';
export const ATTR_DKIM_TOKENS = 'DkimTokens';

const SES = new SESClient({ region: 'eu-west-1' });

export async function handler(event: CdkCustomResourceEvent, _context: Context): Promise<CdkCustomResourceResponse> {
  const domain = event.ResourceProperties[PROP_DOMAIN];
  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      let physicalResourceId = (event as CloudFormationCustomResourceUpdateEvent).PhysicalResourceId;
      if (event.RequestType === 'Create') {
        physicalResourceId = event.RequestId;
      }

      console.log(
        `${event.RequestType}: Do Domain verification and DKIM records for ${event.LogicalResourceId} and domain '${domain}' with PhysicalResourceId '${physicalResourceId}'`,
      );
      const verifyDomainResponse = await SES.send(new VerifyDomainIdentityCommand({ Domain: domain }));
      const verificationToken = verifyDomainResponse.VerificationToken;
      console.log(`${event.RequestType}: Got verification token '${verificationToken}' for domain '${domain}'`);

      const verifyDomainDkimResponse = await SES.send(new VerifyDomainDkimCommand({ Domain: domain }));
      const dkimTokens = verifyDomainDkimResponse.DkimTokens;
      console.log(`${event.RequestType}: Got DKIM tokens '${dkimTokens}' for domain '${domain}'`);

      return {
        PhysicalResourceId: physicalResourceId,
        Data: {
          [ATTR_VERIFICATION_TOKEN]: verificationToken,
          [ATTR_DKIM_TOKENS]: dkimTokens,
        },
      };
    case 'Delete':
      return {
        PhysicalResourceId: event.PhysicalResourceId,
      };
  }
}
