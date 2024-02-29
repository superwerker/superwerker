// eslint-disable-next-line import/no-unresolved
import { DeleteIdentityCommand, SESClient, VerifyDomainDkimCommand, VerifyDomainIdentityCommand } from '@aws-sdk/client-ses';
import * as AWSCDKAsyncCustomResource from 'aws-cdk-lib/custom-resources/lib/provider-framework/types';
// import * as AWS from 'aws-sdk';
export const PROP_DOMAIN = 'Domain';
export const ATTR_VERIFICATION_TOKEN = 'VerificationToken';
export const ATTR_DKIM_TOKENS = 'DkimTokens';

const SES = new SESClient({ region: 'eu-west-1' });
// const SES = new AWS.SES({ region: 'eu-west-1' }); // hardcoded for backward  compatibility

export async function handler(event: AWSCDKAsyncCustomResource.OnEventRequest): Promise<AWSCDKAsyncCustomResource.OnEventResponse> {
  const domain = event.ResourceProperties[PROP_DOMAIN];
  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      let physicalResourceId = event.PhysicalResourceId;
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
    // TODO check if delete should do nothing: https://github.com/superwerker/superwerker/blob/main/templates/rootmail.yaml#L170
    // we store in Parameter Store as well
    case 'Delete':
      console.log(`Deleting Domain identity for domain '${domain}' with PhysicalResourceId '${event.PhysicalResourceId}'`);
      const deleteResponse = await SES.send(new DeleteIdentityCommand({ Identity: domain }));
      console.log(`Deleted Domain identity for domain '${domain}'`, deleteResponse);
      return {
        PhysicalResourceId: event.PhysicalResourceId,
      };
  }
}
