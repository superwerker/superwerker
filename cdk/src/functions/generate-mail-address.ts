import { randomUUID } from 'crypto';
import { Handler } from 'aws-lambda';
import AWS from 'aws-sdk';

const Organizations = new AWS.Organizations({ region: 'us-east-1' });

export interface HandlerEvent {
  domain: string;
  name: string;
}

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

export const handler: Handler<HandlerEvent, HandlerResponse> = async (event) => {
  if (!event.domain || event.domain === '') {
    throw new Error('Missing domain');
  }

  if (!event.name || event.name === '') {
    throw new Error('Missing name');
  }

  // Check if we already generated an email for an account previously.
  // We do this so that our function doesn't accidentally generates new mails, thus triggering a stack update
  // on the Control Tower stack.
  console.log('Checking to see if account exists in AWS Organizations...');
  const data = await getAccounts();
  const account = data.find((item) => item.name === event.name && item.email.endsWith(`@${event.domain}`));
  if (account) {
    const result = { email: account!.email };
    console.log('Found account', result);
    return result;
  }

  const maxCharacters = 64;
  const availableCharacters = maxCharacters - (event.domain.length + 1 + 5); // root+{uuid}@domain.tld
  const id = randomUUID().substring(0, availableCharacters);

  const email = `root+${id}@${event.domain}`;

  if (email.length > 64) {
    throw new Error('Unable to generate email address with less than 64 characters (Control Tower requirement)');
  }

  const result = {
    email,
  };
  console.log('Created new email for account', result);
  return result;
};
