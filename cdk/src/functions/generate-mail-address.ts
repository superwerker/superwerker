import { randomUUID } from 'crypto';


import * as AWSCDKAsyncCustomResource from 'aws-cdk-lib/custom-resources/lib/provider-framework/types';
export const PROP_DOMAIN = 'Domain';
export const PROP_NAME = 'Name';
export const ATTR_EMAIL = 'Email';

export interface HandlerResponse {
  email: string;
}


export function generateEmail(domain: string): string {


  const maxCharacters = 64;
  const availableCharacters = maxCharacters - (domain.length + 1 + 5); // root+{uuid}@domain.tld
  const id = randomUUID().substring(0, availableCharacters);

  const email = `root+${id}@${domain}`;

  if (email.length > 64) {
    throw new Error('Unable to generate email address with more than 64 characters (Control Tower requirement)');
  }

  console.log('Created new email for account', email);
  return email;
}


export async function handler(event: AWSCDKAsyncCustomResource.OnEventRequest): Promise<AWSCDKAsyncCustomResource.OnEventResponse> {
  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      const domain = event.ResourceProperties[PROP_DOMAIN];
      const accountName = event.ResourceProperties[PROP_NAME];
      if (!domain || domain === '') {
        throw new Error('Missing domain');
      }

      if (!accountName || accountName === '') {
        throw new Error('Missing name');
      }

      console.log('Creating/updating email address for account');
      const email = await generateEmail(domain);
      return {
        PhysicalResourceId: `${accountName}@${domain}`,
        Data: {
          [ATTR_EMAIL]: email,
        },
      };
    case 'Delete':
      console.log('Deleting email address, doing nothing');
      return {};
  }
}