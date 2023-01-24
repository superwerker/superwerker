import boto3
import botocore
org = boto3.client('organizations', region_name='us-east-1')


def organizations_close_account(account):
    print(account)
    try:
        response = org.close_account(
            AccountId=account['Id']
        )
        print(response)
    except org.exceptions.AccountAlreadyClosedException:
        print("Account already closed")
    except botocore.exceptions.ClientError as e:
        print(e)


try:
    accounts = org.list_accounts()['Accounts']
except botocore.exceptions.ClientError as e:
    if e.response['Error']['Code'] == 'AWSOrganizationsNotInUseException':
        print("No AWS Organization found, nothing to do")
        exit(0)
    raise e

for account in accounts:
    if account['JoinedMethod'] != 'CREATED' or account['Status'] != 'ACTIVE':
        continue

    organizations_close_account(account)
