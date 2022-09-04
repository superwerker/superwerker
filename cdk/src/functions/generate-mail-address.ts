import { randomUUID } from 'crypto';
// eslint-disable-next-line import/no-unresolved
import * as AWSCDKAsyncCustomResource from 'aws-cdk-lib/custom-resources/lib/provider-framework/types';
import AWS from 'aws-sdk';
export const PROP_DOMAIN = 'Domain';
export const PROP_NAME = 'Name';
export const ATTR_EMAIL = 'Email';

const Organizations = new AWS.Organizations({ region: 'us-east-1' });

export interface HandlerResponse {
  email: string;
}

export interface TmpAccount {
  id: string;
  name: string;
  email: string;
}

const getAccounts = async () => {
  const data: TmpAccount[] = [];
  let response;
  try {
    response = await Organizations.listAccounts({}).promise();
  } catch (e) {
    // @ts-ignore
    if (e.code == 'AWSOrganizationsNotInUseException') {
      return data;
    }
  }

  const parseAccountResponse = (accounts: AWS.Organizations.Accounts) => {
    accounts.forEach((account) => {
      data.push({ id: account.Id!, name: account.Name!, email: account.Email! });
    });
  };

  if (response) {
    parseAccountResponse(response.Accounts!);
    while (response.NextToken) {
      response = await Organizations.listAccounts({
        NextToken: response.NextToken,
        MaxResults: 20,
      }).promise();

      parseAccountResponse(response.Accounts!);
    }
  }

  return data;
};

async function generateEmail(domain: string, name: string): Promise<string> {
  if (!domain || domain === '') {
    throw new Error('Missing domain');
  }

  if (!name || name === '') {
    throw new Error('Missing name');
  }

  // Check if we already generated an email for an account previously.
  // We do this so that our function doesn't accidentally generates new mails, thus triggering a stack update
  // on the Control Tower stack.
  console.log('Checking to see if account exists in AWS Organizations...');
  const data = await getAccounts();
  const account = data.find((item) => item.name === name && item.email.endsWith(`@${domain}`));
  if (account) {
    const email = account!.email;
    console.log('Found account', email);
    return email;
  }

  const maxCharacters = 64;
  const availableCharacters = maxCharacters - (domain.length + 1 + 5); // root+{uuid}@domain.tld
  const id = randomUUID().substring(0, availableCharacters);

  const email = `root+${id}@${domain}`;

  if (email.length > 64) {
    throw new Error('Unable to generate email address with less than 64 characters (Control Tower requirement)');
  }

  console.log('Created new email for account', email);
  return email;
}

export async function handler(event: AWSCDKAsyncCustomResource.OnEventRequest): Promise<AWSCDKAsyncCustomResource.OnEventResponse> {
  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      console.log('Creating/updating email address for account');
      const email = await generateEmail(event.ResourceProperties[PROP_DOMAIN], event.ResourceProperties[PROP_NAME]);
      return {
        PhysicalResourceId: `${event.ResourceProperties[PROP_NAME]}@${event.ResourceProperties[PROP_DOMAIN]}`,
        Data: {
          [ATTR_EMAIL]: email,
        },
      };
    case 'Delete':
      console.log('Deleting email address, doing nothing');
      return {};
  }
}

