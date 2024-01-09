import { randomUUID } from 'crypto';

import {
  OrganizationsClient,
  paginateListAccounts,
  AWSOrganizationsNotInUseException,
  Account,
  AccountStatus,
  ListRootsCommand,
  OrganizationalUnit,
  paginateListOrganizationalUnitsForParent,
  paginateListAccountsForParent,
} from '@aws-sdk/client-organizations';
import * as AWSCDKAsyncCustomResource from 'aws-cdk-lib/custom-resources/lib/provider-framework/types';
export const PROP_DOMAIN = 'Domain';
export const PROP_NAME = 'Name';
export const ATTR_EMAIL = 'Email';

const client = new OrganizationsClient({ region: 'us-east-1' });


export interface HandlerResponse {
  email: string;
}


async function getAccounts(): Promise<Account[]> {
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

async function getSuspendedAccounts(): Promise<Account[]> {
  const listRoots = new ListRootsCommand({});

  let ouList: OrganizationalUnit[] = [];
  try {
    const root = await client.send(listRoots);
    const rootId = root.Roots![0].Id;
    const paginator = paginateListOrganizationalUnitsForParent(
      { client, pageSize: 20 }, { ParentId: rootId! },
    );

    for await (const page of paginator) {
      ouList.push(...page.OrganizationalUnits!);
    }
  } catch (e) {
    if (e instanceof AWSOrganizationsNotInUseException) {
      return [];
    }
  }

  const suspendedOU = ouList.filter(ou => ou.Name === 'Suspended');

  if (suspendedOU.length < 1) {
    return [];
  }
  const suspendedOUId = suspendedOU[0].Id;

  const accounts: Account[] = [];
  try {
    const paginator = paginateListAccountsForParent(
      { client, pageSize: 20 }, { ParentId: suspendedOUId! },
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


async function getEmail(domain: string, name: string): Promise<string> {
  if (!domain || domain === '') {
    throw new Error('Missing domain');
  }

  if (!name || name === '') {
    throw new Error('Missing name');
  }

  // Check if we already generated an email for an account previously.
  // We do this so that our function doesn't accidentally generates new mail addresses, thus triggering a stack update
  // on the Control Tower stack or updating the root mail addresses of existing accounts.
  console.log('Checking to see if account exists in AWS Organizations...');
  const accounts = await getAccounts();
  const suspendedAccounts = await getSuspendedAccounts();

  // account must be active and not in suspended OU
  const activeAccounts = accounts.filter(account => account.Status == AccountStatus.ACTIVE)
    .filter(account => !suspendedAccounts.find(suspended => suspended.Email === account.Email));

  const account = activeAccounts.find((acc) => acc.Name === name && acc.Email!.endsWith(`@${domain}`));
  if (account) {
    const email = account!.Email!;
    console.log('Found account', email);
    return email;
  }

  return generateEmail(domain);
}


export async function handler(event: AWSCDKAsyncCustomResource.OnEventRequest): Promise<AWSCDKAsyncCustomResource.OnEventResponse> {
  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      console.log('Creating/updating email address for account');
      const email = await getEmail(event.ResourceProperties[PROP_DOMAIN], event.ResourceProperties[PROP_NAME]);
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