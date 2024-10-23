import boto3
import sys
import time

def handler(event, context):

    org = boto3.client('organizations')
    
    suspendedOUId=getSuspendedAccounts(org)

    #Check if suspended OU exists
    if suspendedOUId=="":
        print("SUSPENDED OU does not exist")
        return "ERROR: SUSPENDED OU does not exist"

    paginator = org.get_paginator("list_accounts_for_parent").paginate(ParentId=suspendedOUId)

    #Check if there are Active Accounts in the Suspended OU
    active_accounts=list(paginator.search("Accounts[?Status==`ACTIVE`][]"))
    numberOfActiveAccounts= len(active_accounts)

    if numberOfActiveAccounts==0:
        return "All the accounts in Suspened OU are already closed. No action needed."

    try:
        for account in active_accounts:
            print("Closing Account with ID: ", account["Id"])
            org.close_account(AccountId=account['Id'])
            time.sleep(10)
            print('Account with ID: '+account["Id"]+ ' is closed successfully.')
        
    except org.exceptions.ConstraintViolationException as e:
        errorResponse=e.response["Error"]
        errorCode = errorResponse["Code"]
        errorMessage = errorResponse["Message"]
        errorReason= e.response["Reason"]
        print("ERROR: {} - {} - {}".format(errorCode, errorReason, errorMessage))
        return "ERROR: {} - {} - {}".format(errorCode, errorReason, errorMessage)
        
    return "Accounts in Suspended OU closed successfully."

def getSuspendedAccounts(client):
    root=client.list_roots()

    rootId=root["Roots"][0]["Id"]

    paginator = client.get_paginator('list_organizational_units_for_parent')

    response_iterator = (paginator.paginate(ParentId=rootId))

    for item in response_iterator:
        ous = item["OrganizationalUnits"]
        for ou in ous:
            if ou["Name"] == "Suspended":
                return ou["Id"]

    return ""