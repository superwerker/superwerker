#!/bin/bash

set -euo pipefail

echo "==================================================="
echo "This script will attempt to clean up superwerker"

DIR="${BASH_SOURCE%/*}"
if [[ ! -d "$DIR" ]]; then DIR="$PWD"; fi
. "$DIR/promt.sh"

function set_master_credentials() {
    export AWS_ACCESS_KEY_ID=$MASTER_AWS_ACCESS_KEY_ID
    export AWS_SECRET_ACCESS_KEY=$MASTER_AWS_SECRET_ACCESS_KEY
    export AWS_SESSION_TOKEN=$MASTER_AWS_SESSION_TOKEN
    export AWS_DEFAULT_REGION=$MASTER_AWS_DEFAULT_REGION
}

function delete_sw_buckets() {
    # Bucket must be empty else the superwerker rootmail stack fails beacuse the bucket is not empty
    echo "Deleting buckets with prefix 'superwerker-rootmail'"
    BUCKETS=$(aws s3api list-buckets --query 'Buckets[?starts_with(Name, `superwerker-rootmail`)].Name' --output text)

    for BUCKET in $BUCKETS; do
        echo "Empting bucket $BUCKET"
        aws s3 rm s3://"$BUCKET" --recursive

        echo "Deleting bucket $BUCKET"
        aws s3 rb s3://"$BUCKET"
    done

    # Bucket must be empty else the superwerker backup stack which rolls out an aws conformance pack fails beacuse the bucket is not empty
    echo "Deleting backup buckets with prefix 'awsconfigconforms'"
    BUCKETS=$(aws s3api list-buckets --query 'Buckets[?starts_with(Name, `awsconfigconforms`)].Name' --output text)

    for BUCKET in $BUCKETS; do
        echo "Empting bucket $BUCKET"
        aws s3 rm s3://"$BUCKET" --recursive

        echo "Deleting bucket $BUCKET"
        aws s3 rb s3://"$BUCKET"
    done
    
}

function delete_sw_stack() {
    # Must be deleted so new superwerker stack can be installed, control tower cannot be installed multiple times in the same org
    echo "Deleting main superwerker Cloudformation stack"
    STACKS=$(aws cloudformation describe-stacks --stack-name superwerker --query 'Stacks[0].StackId' --output text) || true

    for STACK in $STACKS; do
        aws cloudformation delete-stack --stack-name "$STACK" --no-cli-pager
        aws cloudformation wait stack-delete-complete --stack-name "$STACK" --no-cli-pager   
    done
}

function delete_sw_cloudwatch_resources(){
    # Cleanup not necessary, because log groups have unique hash, however we dont want to pile up endeless log groups
    for REGION in "$AWS_DEFAULT_REGION" "eu-west-1"; do
    
        echo "Deleting superwerker Cloudwatch resources in $REGION"

        DASHBOARDS=$(aws cloudwatch list-dashboards --region "$REGION" --query 'DashboardEntries[?starts_with(DashboardName, `superwerker`)].DashboardName' --output text)

        for DASHBOARD in $DASHBOARDS; do
            echo "Deleting cw dashboard '$DASHBOARD'"
            aws cloudwatch delete-dashboards --region "$REGION" --dashboard-names "$DASHBOARD"
        done

        if [ "$REGION" == "eu-west-1" ]; then
            echo "Deleting superwerker stackset Cloudwatch log groups in $REGION"
            LOG_GROUPS=$(aws logs describe-log-groups --region "$REGION" --query 'logGroups[?starts_with(logGroupName, `/aws/lambda/StackSet-superwerker-`)].logGroupName' --output text)
        else
            echo "Deleting superwerker Cloudwatch log groups in $REGION"
            LOG_GROUPS=$(aws logs describe-log-groups --region "$REGION" --query 'logGroups[?starts_with(logGroupName, `/aws/lambda/superwerker`)].logGroupName' --output text)
        fi

        for LOG_GROUP in $LOG_GROUPS
        do
            echo "Deleting log group $LOG_GROUP"
            aws logs delete-log-group --region "$REGION" --log-group-name "$LOG_GROUP"
        done

    done
}

function delete_sw_ses() {
    echo "Deleting ses identity"

    REG=eu-west-1 # currently hardcoded in superwerker
    IDENTITIES=$(aws ses list-identities --region "$REG" --output text | sed 's/IDENTITIES//g')

    for IDENTITY in $IDENTITIES; do
        echo "Deleting identity $IDENTITY in $REG"
        aws ses delete-identity --region "$REG" --identity "$IDENTITY"
    done
}

function delete_sw_ssm() {
    echo "Deleting ssm parameters with prefix '/superwerker'"
    PARAMETERS=$(aws ssm describe-parameters --query 'Parameters[?starts_with(Name, `/superwerker`)].Name' --output text)

    for PARAMETER in $PARAMETERS
    do
        echo "Deleting ssm parameter $PARAMETER"
        aws ssm delete-parameter --name "$PARAMETER"
    done
}

function delete_sw_guard_duty() {
    # Must deregister the audit account as guard duty adminstrator and delete the detector so new superwerker installation can register Guard Duty with new Audit Account
    echo "Deleting guard duty config"
    
    ACC=$1
    echo "Deregistering Audit Account $ACC as delegated guardduty administrator"
    aws organizations deregister-delegated-administrator --account-id "$ACC" --service-principal guardduty.amazonaws.com || true
    echo "Waiting until admin account is deregistered..."
    while admin=$(aws organizations list-delegated-administrators --service-principal guardduty.amazonaws.com --query DelegatedAdministrators.Id --output text); do
        if [[ "$admin" == "None" ]]; then
            echo "Admin account is deregistered"
            break;
        fi
    done

    DETECTORS=$(aws guardduty list-detectors --query 'DetectorIds[]' --output text)
    echo "Config Detectors:"
    echo "$DETECTORS"

    for DETECTOR in $DETECTORS; do
        echo "Deleting Detector $DETECTOR"
        while ! aws guardduty delete-detector --detector-id "$DETECTOR" 2>/dev/null; do sleep 1; done
    done
}

function delete_sw_security_hub() {
    # Must deregister the audit account as security hub adminstrator
    echo "Deleting security hub config"
    
    ACC=$1
    echo "Deregistering Audit Account $ACC as delegated security hub administrator"
    aws organizations deregister-delegated-administrator --account-id "$ACC" --service-principal securityhub.amazonaws.com || true
    echo "Waiting until admin account is deregistered..."
    while admin=$(aws organizations list-delegated-administrators --service-principal securityhub.amazonaws.com --query DelegatedAdministrators.Id --output text); do
        if [[ "$admin" == "None" ]]; then
            echo "Admin account is deregistered"
            break;
        fi
    done
}

function delete_ct_sso() {
    # Currently not implemented since no API is available for this, not necessary for cleanup accoring to AWS documentation
    echo "Deleting identity center configuration"
}

function delete_ct_cloudwatch_resources(){
    # The aws-controltower/CloudTrailLogs log group must be deleted else new control tower installation will fail because it already exists
    echo "Deleting CT Cloudwatch resources"

    LOG_GROUPS=$(aws logs describe-log-groups --query 'logGroups[?starts_with(logGroupName, `aws-controltower/CloudTrailLogs`)].logGroupName' --output text)

    for LOG_GROUP in $LOG_GROUPS
    do
        echo "Deleting log group $LOG_GROUP"
        aws logs delete-log-group --log-group-name "$LOG_GROUP"
    done
}

function delete_ct_organization_units() {
    # Controltower fails if there is an existing 'Security' or 'Sandbox' OU
    # Thats why the 'Log Archive' and 'Audit' accounts are moved to the 'Suspended' OU and the Security and Sandbox OU are deleted
    # The Accounts are suspended by a seperate automation due to the max % of accounts that can be suspended at once
    # We are not reusing the existing 'Log Archive' and 'Audit' accounts, because we want to test the end-to-end installation of superwerker

    echo "Deleting controltower organization units 'Security' and 'Sandbox' and moving 'audit' and 'log archive' to 'suspended' OU"
    ROOT_ID=$(aws organizations list-roots | jq -r '.Roots | .[] | .Id')

    SUSPENDED_ID=$(aws organizations list-organizational-units-for-parent --parent-id "$ROOT_ID" | jq -r '.OrganizationalUnits | .[] | select(.Name=="Suspended") | .Id')

    if [ -z "$SUSPENDED_ID" ]; then
        echo "Suspended OU not found, creating now"
        SUSPENDED_ID=$(aws organizations create-organizational-unit --parent-id "$ROOT_ID" --name Suspended | jq -r '.OrganizationalUnit | .Id')
    else
        echo "Suspended OU already exists, skipping creation"
    fi

    SANDBOX_IDS=$(aws organizations list-organizational-units-for-parent --parent-id "$ROOT_ID" | jq -r '.OrganizationalUnits | .[] | select(.Name=="Sandbox") | .Id')

    for SANDBOX_ID in $SANDBOX_IDS; do
        echo "Deleting Sandbox OU"
        aws organizations delete-organizational-unit --organizational-unit-id "$SANDBOX_ID"
    done

    SECURITY_ID=$(aws organizations list-organizational-units-for-parent --parent-id "$ROOT_ID" | jq -r '.OrganizationalUnits | .[] | select(.Name=="Security") | .Id')

    # get aws account with name 'Audit'
    AUDIT_ACCOUNT=$(aws organizations list-accounts-for-parent --parent-id "$SECURITY_ID" | jq -r '.Accounts | .[] | select(.Name=="Audit") | .Id')

    # get aws account with name 'Audit'
    LOG_ACCOUNT=$(aws organizations list-accounts-for-parent --parent-id "$SECURITY_ID" | jq -r '.Accounts | .[] | select(.Name=="Log Archive") | .Id')

    echo "Moving 'Audit' account to Suspended OU"
    aws organizations move-account --account-id "$AUDIT_ACCOUNT" --source-parent-id "$SECURITY_ID" --destination-parent-id "$SUSPENDED_ID"

    echo "Moving 'Log Archive' account to Suspended OU"
    aws organizations move-account --account-id "$LOG_ACCOUNT" --source-parent-id "$SECURITY_ID" --destination-parent-id "$SUSPENDED_ID"

    echo "Deleting Security OU"
    aws organizations delete-organizational-unit --organizational-unit-id "$SECURITY_ID"
    
}

function delete_sw_backup_stacksets() {
    # Cleanup stack set instances before deleting the backup stack set
    # this should prevent errors with stack set instances for suspended accounts not being cleaned up automatically when deleting the stack set
    echo "Deleting Backup Stacksets"

    ROOT_ID=$(aws organizations list-roots | jq -r '.Roots | .[] | .Id')
    SUSPENDED_ID=$(aws organizations list-organizational-units-for-parent --parent-id "$ROOT_ID" | jq -r '.OrganizationalUnits | .[] | select(.Name=="Suspended") | .Id')

    STACK_SETS=$(aws cloudformation list-stack-sets --status ACTIVE --query 'Summaries[?starts_with(StackSetName, `superwerker-backup`)].StackSetName' --no-paginate  --output text) || true
    
    for STACK_SET in $STACK_SETS; do

        aws cloudformation delete-stack-instances --stack-set-name "$STACK_SET" --deployment-targets OrganizationalUnitIds="$SUSPENDED_ID" --regions "$AWS_DEFAULT_REGION" --retain-stacks --output text --no-cli-pager

    done

 }

function delete_ct_stacksets() {
    # Currently not implemented, not explictly necessary for cleanup according to AWS documentation
    echo "Deleting Stacksets"
}

function delete_ct_kms() {
    
    echo "Schedule deletion for KMS keys used by AWS Control Tower"
    KMS_KEY_IDS=$(aws kms list-keys --query 'Keys[].KeyId' --no-paginate  --output text) || true
    
    for KMS_KEY_ID in $KMS_KEY_IDS; do

        CONTROL_TOWER_KEY_ID=$(aws kms describe-key --key-id "${KMS_KEY_ID}" --output json --no-cli-pager |  jq -r '.KeyMetadata | select(.Description=="KMS key used by AWS Control Tower") | select(.KeyState=="Enabled") | .KeyId')
        if [ -n "$CONTROL_TOWER_KEY_ID" ]; then
            echo "Scheduling deletion for KMS key $CONTROL_TOWER_KEY_ID"
            aws kms schedule-key-deletion --key-id "${CONTROL_TOWER_KEY_ID}" --pending-window-in-days 7 --no-cli-pager
        fi
    done
}

function delete_ct_iam_roles() {
    ROLES=$(aws iam list-roles --query 'Roles[?starts_with(RoleName, `AWSControlTower`)].RoleName' --output text)

    for ROLE in $ROLES
    do
        POLICIES=$(aws iam list-attached-role-policies --role-name "$ROLE" --query 'AttachedPolicies[].PolicyArn' --output text)

        for POLICY in $POLICIES
        do
            echo "Detaching IAM policy $POLICY from role $ROLE"
            aws iam detach-role-policy --role-name "$ROLE" --policy-arn "$POLICY"
        done

        echo "Deleting IAM role $ROLE"
        aws iam delete-role --role-name "$ROLE"
    done

    POLICIES=$(aws iam list-policies --query 'Policies[?starts_with(PolicyName, `AWSControlTower`)].PolicyName' --scope Local --output text)

    for POLICY in $POLICIES
    do
        echo "Deleting IAM policy $POLICY"
        aws iam delete-policy --policy-arn arn:aws:iam::$(aws sts get-caller-identity --query 'Account' --output text):policy/service-role/"$POLICY"
    done

    if [ -z "$POLICIES" ]; then
        echo "no IAM policies found, no cleanup required"
    fi

    if [ -z "$ROLES" ]; then
        echo "no IAM roles found, no cleanup required"
    fi
}

function delete_ct_principal() {
    # ControlTower prinical must be disabled according to the AWS documentation if you want to fully cleanup controltower
    echo "Deleting controltower principal"
    aws organizations disable-aws-service-access --service-principal controltower.amazonaws.com
}


function create_config_recorder() {
    # must create config recorders in Log Archive and Audit account because they are gone after control tower is decomissioned
    # this is needed so the next installation of superwerker will work if accounts have not be suspeded (due to the max % of accounts that can be suspended at once we can guarantee that all accounts are suspended at all times)
    # the backup stack creates an organization conformance pack which is rolled out to all account (except the master and suspended account), but fails if the account has no config recorder
        
    ACC=$1
    echo "Creating config recorder in account $ACC"
    aws configservice put-configuration-recorder --configuration-recorder "{ \"name\": \"recorder\", \"roleARN\": \"arn:aws:iam::$ACC:role/aws-service-role/config.amazonaws.com/AWSServiceRoleForConfig\" }"
}

function main () {
    echo "Checking if LZA is installed"
    STACKS=$(aws cloudformation list-stacks --query 'StackSummaries[?starts_with(StackName, `AWSAccelerator-`)].StackName' --output text)

    if [ -z "$STACKS" ]; then
        echo "LZA check sucessful"
    else
        echo "LZA check failed, aborting cleanup, you must delete LZA resources first."
        exit 1
    fi

    MASTER_ACCOUNT_ID=$(aws sts get-caller-identity --query 'Account' --output text)

    MASTER_AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID
    MASTER_AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY
    MASTER_AWS_SESSION_TOKEN=
    MASTER_AWS_DEFAULT_REGION=$AWS_DEFAULT_REGION

    ROOT_ID=$(aws organizations list-roots | jq -r '.Roots | .[] | .Id')

    SECURITY_OU_ID=$(aws organizations list-organizational-units-for-parent --parent-id "$ROOT_ID" | jq -r '.OrganizationalUnits | .[] | select(.Name=="Security") | .Id')
    
    if [ -z "${SECURITY_OU_ID}" ]; then
        echo "No Security OU found. Exiting."
        return
    fi

    LOG_ACCOUNT=$(aws organizations list-accounts-for-parent --parent-id "$SECURITY_OU_ID" | jq -r '.Accounts | .[] | select(.Name=="Log Archive") | .Id')
    AUDIT_ACCOUNT=$(aws organizations list-accounts-for-parent --parent-id "$SECURITY_OU_ID" | jq -r '.Accounts | .[] | select(.Name=="Audit") | .Id')


    ACCOUNTS=(
        "$MASTER_ACCOUNT_ID"
        "$LOG_ACCOUNT"
        "$AUDIT_ACCOUNT"
    )

    for ACCOUNT_ID in "${ACCOUNTS[@]}"; do
        echo "==================================================="
        echo "deleting resources in account $ACCOUNT_ID"

        if [ "$ACCOUNT_ID" != "$MASTER_ACCOUNT_ID" ]; then
            echo "assuming OrganizationAccountAccessRole role in account $ACCOUNT_ID"
            set_master_credentials

            # get temporary credentials
            TEMP_CREDS=$(aws sts assume-role --role-arn "arn:aws:iam::$ACCOUNT_ID:role/OrganizationAccountAccessRole" --role-session-name superwerker-cleanup)

            AWS_ACCESS_KEY_ID=$(echo "$TEMP_CREDS" | jq -r '.Credentials.AccessKeyId')
            export AWS_ACCESS_KEY_ID
            AWS_SECRET_ACCESS_KEY=$(echo "$TEMP_CREDS" | jq -r '.Credentials.SecretAccessKey')
            export AWS_SECRET_ACCESS_KEY
            AWS_SESSION_TOKEN=$(echo "$TEMP_CREDS" | jq -r '.Credentials.SessionToken')
            export AWS_SESSION_TOKEN
        fi

        # first delete everything in Master account
        if [ "$ACCOUNT_ID" == "$MASTER_ACCOUNT_ID" ]; then
                echo "Deleting superwerker resources"
                delete_sw_buckets
                delete_sw_backup_stacksets
                delete_sw_stack
                delete_sw_cloudwatch_resources
                delete_sw_ses
                delete_sw_ssm

                delete_sw_guard_duty "$AUDIT_ACCOUNT"
                delete_sw_security_hub "$AUDIT_ACCOUNT"

                echo "Deleting controltower resources"
                delete_ct_sso
                delete_ct_cloudwatch_resources
                delete_ct_organization_units
                delete_ct_stacksets
                delete_ct_kms
                delete_ct_iam_roles
                delete_ct_principal
                
        fi

        # Create config recorders in Log Archive and Audit account for a clean installation of superwerker next time
        if [ "$ACCOUNT_ID" != "$MASTER_ACCOUNT_ID" ]; then
            create_config_recorder "$ACCOUNT_ID"
        fi
    
    done

    echo "Cleanup completed!"
}

main

# reset credentials
set_master_credentials