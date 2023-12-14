import { randomUUID } from 'crypto';

import {
  OrganizationsClient,
  paginateListAccounts,
  paginateListAccountsForParent,
  paginateListOrganizationalUnitsForParent,
  ListRootsCommand,
  AWSOrganizationsNotInUseException,
  OrganizationalUnit,
  Account,
} from '@aws-sdk/client-organizations';
import * as AWSCDKAsyncCustomResource from 'aws-cdk-lib/custom-resources/lib/provider-framework/types';
export const PROP_DOMAIN = 'Domain';
export const PROP_NAME = 'Name';
export const ATTR_EMAIL = 'Email';

const client = new OrganizationsClient({ region: 'us-east-1' });


export interface HandlerResponse {
  email: string;
}

export interface TmpAccount {
  id: string;
  name: string;
  email: string;
}

const getAccounts = async () => {
  const accounts: Account[] = [];


  try {
    const paginator = paginateListAccounts(
      { client, pageSize: 20 }, {},
    );

    for await (const page of paginator) {
      accounts.push(...page.Accounts!);
    }
  } catch (e) {
    if (e instanceof AWSOrganizationsNotInUseException) {
      return [];
    }
  }

  return accounts;
};

const getSuspendedAccounts = async () => {
  const accounts: Account[] = [];


  try {
    const paginator = paginateListAccounts(
      { client, pageSize: 20 }, {},
    );

    for await (const {} of paginator) {

    }
  } catch (e) {
    if (e instanceof AWSOrganizationsNotInUseException) {
      return [];
    }
  }


  const rootCommand = new ListRootsCommand({});
  const root = await client.send(rootCommand);
  const rootId = root.Roots![0].Id;


  let ouList: OrganizationalUnit[] = [];
  try {
    const ouPaginator = paginateListOrganizationalUnitsForParent(
      { client, pageSize: 20 }, { ParentId: rootId! },
    );

    for await (const page of ouPaginator) {
      ouList.push(...page.OrganizationalUnits!);
    }
  } catch (e) {
    return [];
  }


  const suspendedOU = ouList.filter(ou => ou.Name === 'Suspended');

  if (suspendedOU.length < 1) {
    return [];
  }
  const suspendedOUId = suspendedOU[0].Id;

  const accountsForParentPaginator = paginateListAccountsForParent(
    { client, pageSize: 20 }, { ParentId: suspendedOUId! },
  );

  for await (const page of accountsForParentPaginator) {
    accounts.push(...page.Accounts!);
  }


  return accounts;
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
  const accounts = await getAccounts();
  const suspendedAccounts = await getSuspendedAccounts();
  let abortCreatingNewEmail = false;
  let abortedEmail = '';

  accounts.forEach((account) => {
    console.log('Checking account:', account);
    abortedEmail = account.Email!;
    if (account.Name === name && account.Email!.endsWith(`@${domain}`)) {
      console.log(`Found potential match for account ${account.Id} called ${name} with email ${account.Email}`);

      console.log('Checking if account is suspended');
      if (suspendedAccounts.length < 1) {
        console.log('No suspended accounts found');
        console.log('Aborting email creation');
        abortCreatingNewEmail = true;
      } else {
        const acc = suspendedAccounts.find((suspendedAccount) => suspendedAccount.Id === account.Id);
        if (acc) {
          console.log('Account is suspended and can be ignored');
          console.log('Continuing to create new email');
        } else {
          console.log('Account is not suspended');
          console.log('Aborting email creation');
          abortCreatingNewEmail = true;
        }
      }
    }
  });

  if (abortCreatingNewEmail) {
    console.log('Email creation aborted');
    return abortedEmail;
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