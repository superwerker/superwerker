#!/bin/bash
echo "==================================================="
echo "This script will attempt to clean up all LZA resources"

DIR="${BASH_SOURCE%/*}"
if [[ ! -d "$DIR" ]]; then DIR="$PWD"; fi
. "$DIR/promt.sh"

function set_master_credentials() {
    export AWS_ACCESS_KEY_ID=$MASTER_AWS_ACCESS_KEY_ID
    export AWS_SECRET_ACCESS_KEY=$MASTER_AWS_SECRET_ACCESS_KEY
    export AWS_SESSION_TOKEN=$MASTER_AWS_SESSION_TOKEN
    export AWS_DEFAULT_REGION=$MASTER_AWS_DEFAULT_REGION
}

function delete_stacks() {
    # stacks must be deleted in the following order, else roles might be missing
    # at the end customization stacks can be cleaned up as well
    STACKS=(
        "AWSAccelerator-ResourcePolicyEnforcementStack-$ACCOUNT_ID-$AWS_DEFAULT_REGION"
        "AWSAccelerator-CustomizationsStack-$ACCOUNT_ID-$AWS_DEFAULT_REGION"
        "AWSAccelerator-NetworkAssociationsGwlbStack-$ACCOUNT_ID-$AWS_DEFAULT_REGION"
        "AWSAccelerator-NetworkAssociationsStack-$ACCOUNT_ID-$AWS_DEFAULT_REGION"
        "AWSAccelerator-NetworkVpcDnsStack-$ACCOUNT_ID-$AWS_DEFAULT_REGION"
        "AWSAccelerator-NetworkVpcEndpointsStack-$ACCOUNT_ID-$AWS_DEFAULT_REGION"
        "AWSAccelerator-NetworkVpcStack-$ACCOUNT_ID-$AWS_DEFAULT_REGION"
        "AWSAccelerator-SecurityResourcesStack-$ACCOUNT_ID-$AWS_DEFAULT_REGION"
        "AWSAccelerator-OperationsStack-$ACCOUNT_ID-$AWS_DEFAULT_REGION"
        "AWSAccelerator-NetworkPrepStack-$ACCOUNT_ID-$AWS_DEFAULT_REGION"
        "AWSAccelerator-SecurityAuditStack-$ACCOUNT_ID-$AWS_DEFAULT_REGION" 
        "AWSAccelerator-SecurityStack-$ACCOUNT_ID-$AWS_DEFAULT_REGION"
        "AWSAccelerator-OrganizationsStack-$ACCOUNT_ID-$AWS_DEFAULT_REGION"
        "AWSAccelerator-LoggingStack-$ACCOUNT_ID-$AWS_DEFAULT_REGION"
        "AWSAccelerator-DependenciesStack-$ACCOUNT_ID-$AWS_DEFAULT_REGION"
        "AWSAccelerator-KeyStack-$ACCOUNT_ID-$AWS_DEFAULT_REGION"
        "AWSAccelerator-PrepareStack-$ACCOUNT_ID-$AWS_DEFAULT_REGION"
        "AWSAccelerator-PipelineStack-$ACCOUNT_ID-$AWS_DEFAULT_REGION"
        "AWSAccelerator-DiagnosticsPackStack-$ACCOUNT_ID-$AWS_DEFAULT_REGION"
        "AWSAccelerator-CDKToolkit"
        "landing-zone-accelerator"
        "superwerker-lza-iam-access-analyzer"
    )

    loop over stacks and delete them
    for STACK in "${STACKS[@]}"; do
        echo "Deleting stack $STACK"

        # describe stack to check if it exists
        RES=$(aws cloudformation describe-stacks --stack-name "$STACK" --no-paginate --output text 2> /dev/null)

        if [ -z "$RES" ]; then
            echo "not found, skipping"
            continue
        fi

        # remove deletion protection
        aws cloudformation update-termination-protection --no-enable-termination-protection --stack-name "$STACK" --no-cli-pager

        echo "Deleting stack $STACK"
        aws cloudformation delete-stack --stack-name "$STACK" --no-cli-pager
        aws cloudformation wait stack-delete-complete --stack-name "$STACK" --no-cli-pager        

    done

    echo "==================================================="
    echo "deleting stacks that fail and retain their resources resources"

    STACKS=(
        "AWSAccelerator-SecurityAuditStack-$ACCOUNT_ID-$AWS_DEFAULT_REGION"
        "AWSAccelerator-SecurityResourcesStack-$ACCOUNT_ID-$AWS_DEFAULT_REGION"
    )

    # loop over stacks and delete them
    for STACK in "${STACKS[@]}"; do
        echo "Deleting stack $STACK and retaining resources"

        # describe stack to check if it exists
        RES=$(aws cloudformation describe-stacks --stack-name "$STACK" --no-paginate --output text 2> /dev/null)

        if [ -z "$RES" ]; then
            echo "not found, skipping"
            continue
        fi

        if [[ "$STACK" == *"AWSAccelerator-SecurityAuditStack"* ]]; then
            LOGICAL_ID_GUARD_DUTY=$(aws cloudformation describe-stack-resources --stack-name "$STACK" --no-paginate --query 'StackResources[?ResourceType==`Custom::GuardDutyUpdateDetector`].LogicalResourceId' --output text)
            LOGICAL_ID_SECURITY_HUB=$(aws cloudformation describe-stack-resources --stack-name "$STACK" --no-paginate --query 'StackResources[?ResourceType==`Custom::SecurityHubCreateMembers`].LogicalResourceId' --output text)

            echo "Deleting stack $STACK"
            aws cloudformation delete-stack --stack-name "$STACK" --retain-resources "$LOGICAL_ID_GUARD_DUTY" "$LOGICAL_ID_SECURITY_HUB" --no-cli-pager
            aws cloudformation wait stack-delete-complete --stack-name "$STACK" --no-cli-pager
        fi

        if [[ "$STACK" == *"AWSAccelerator-SecurityResourcesStack"* ]]; then
            LOGICAL_IDS=$(aws cloudformation describe-stack-resources --stack-name "$STACK" --no-paginate --query 'StackResources[?ResourceType==`Custom::ConfigServiceRecorder`].LogicalResourceId' --output text)

            echo "Deleting stack $STACK"
            aws cloudformation delete-stack --stack-name "$STACK" --retain-resources "$LOGICAL_IDS" --no-cli-pager
            aws cloudformation wait stack-delete-complete --stack-name "$STACK" --no-cli-pager
        fi

        aws cloudformation delete-stack --stack-name "$STACK" --no-cli-pager
        aws cloudformation wait stack-delete-complete --stack-name "$STACK" --no-cli-pager
    done

    echo "==================================================="
    echo "deleting central us-east-1 stacks"

    STACKS=(
        "AWSAccelerator-FinalizeStack-$ACCOUNT_ID-us-east-1"
        "AWSAccelerator-AccountsStack-$ACCOUNT_ID-us-east-1"
        "AWSAccelerator-CDKToolkit"
    )

    # loop over stacks and delete them
    for STACK in "${STACKS[@]}"; do
        echo "Deleting stack $STACK"

        # describe stack to check if it exists
        RES=$(aws cloudformation describe-stacks --region us-east-1 --stack-name "$STACK" --no-paginate --output text 2> /dev/null)

        if [ -z "$RES" ]; then
            echo "not found, skipping"
            continue
        fi

        # remove deletion protection
        aws cloudformation update-termination-protection --region us-east-1 --no-enable-termination-protection --stack-name "$STACK" --no-cli-pager

        aws cloudformation delete-stack --region us-east-1 --stack-name "$STACK" --no-cli-pager
        aws cloudformation wait stack-delete-complete --region us-east-1 --stack-name "$STACK" --no-cli-pager
    done
}

function delete_logs() {
    echo "Deleting Cloudwatch Logs"

    # LAMDBA us-east-1
    LOG_GROUPS=$(aws logs describe-log-groups --region us-east-1 --query 'logGroups[?starts_with(logGroupName, `/aws/lambda/AWSAccelerator-`)].logGroupName' --output text)

    # loop over all log groups
    for LOG_GROUP in $LOG_GROUPS
    do
        echo "Deleting log group $LOG_GROUP"
        aws logs delete-log-group --region us-east-1 --log-group-name "$LOG_GROUP"
    done

    # LAMDBA1
    LOG_GROUPS=$(aws logs describe-log-groups --query 'logGroups[?starts_with(logGroupName, `/aws/lambda/AWSAccelerator-`)].logGroupName' --output text)

    # loop over all log groups
    for LOG_GROUP in $LOG_GROUPS
    do
        echo "Deleting log group $LOG_GROUP"
        aws logs delete-log-group --log-group-name "$LOG_GROUP"
    done

    # LAMDBA2
    LOG_GROUPS=$(aws logs describe-log-groups --query 'logGroups[?starts_with(logGroupName, `/aws/lambda/landing-zone-accelerator-`)].logGroupName' --output text)

    # loop over all log groups
    for LOG_GROUP in $LOG_GROUPS
    do
        echo "Deleting log group $LOG_GROUP"
        aws logs delete-log-group --log-group-name "$LOG_GROUP"
    done

    # CODEBUILD
    LOG_GROUPS=$(aws logs describe-log-groups --query 'logGroups[?starts_with(logGroupName, `/aws/codebuild/AWSAccelerator-`)].logGroupName' --output text)

    # loop over all log groups
    for LOG_GROUP in $LOG_GROUPS
    do
        echo "Deleting log group $LOG_GROUP"
        aws logs delete-log-group --log-group-name "$LOG_GROUP"
    done
}

function delete_buckets() {
    echo "Emptying and deleting Buckets"

    for bucket in $(aws s3api list-buckets --query "Buckets[?starts_with(Name, 'aws-accelerator-')].Name" --output text); do

        echo "Emptying bucket $bucket"
        aws s3 rm s3://"$bucket" --recursive
        
        NB_OBJECTS=$(aws s3api list-object-versions --bucket "${bucket}" --query='length(Versions[*] || `[]` )')
        if [[ "$NB_OBJECTS" != "0" ]]; then
        while [[ $NB_OBJECTS -gt 0 ]]
        do
            aws s3api delete-objects --bucket "${bucket}" --delete "$(aws s3api list-object-versions --bucket "${bucket}" --max-items 500 --query='{Objects: Versions[0:500].{Key:Key,VersionId:VersionId}}')" --query 'length(Deleted[*] || `[]` )' > /dev/null
            NB_OBJECTS=$((NB_OBJECTS  > 500 ? NB_OBJECTS - 500 : 0))
        done
        fi

        NB_OBJECTS=$(aws s3api list-object-versions --bucket "${bucket}" --query='length(DeleteMarkers[*] || `[]` )')
        if [[ "$NB_OBJECTS" != "0" ]]; then
        while [[ $NB_OBJECTS -gt 0 ]]
        do
            aws s3api delete-objects --bucket "${bucket}" --delete "$(aws s3api list-object-versions --bucket "${bucket}" --max-items 500 --query='{Objects: DeleteMarkers[0:500].{Key:Key,VersionId:VersionId}}')" --query 'length(Deleted[*] || `[]` )' > /dev/null
            NB_OBJECTS=$((NB_OBJECTS  > 500 ? NB_OBJECTS - 500 : 0))
        done
        fi

        echo "Deleting bucket $bucket"
        aws s3api delete-bucket --bucket "$bucket"
    done

    for bucket in $(aws s3api list-buckets --query "Buckets[?starts_with(Name, 'cdk-accel-assets-')].Name" --output text); do

        echo "Emptying bucket $bucket"
        aws s3 rm s3://"$bucket" --recursive
        
        NB_OBJECTS=$(aws s3api list-object-versions --bucket "${bucket}" --query='length(Versions[*] || `[]` )')
        if [[ "$NB_OBJECTS" != "0" ]]; then
        while [[ $NB_OBJECTS -gt 0 ]]
        do
            aws s3api delete-objects --bucket "${bucket}" --delete "$(aws s3api list-object-versions --bucket "${bucket}" --max-items 500 --query='{Objects: Versions[0:500].{Key:Key,VersionId:VersionId}}')" --query 'length(Deleted[*] || `[]` )' > /dev/null
            NB_OBJECTS=$((NB_OBJECTS  > 500 ? NB_OBJECTS - 500 : 0))
        done
        fi

        NB_OBJECTS=$(aws s3api list-object-versions --bucket "${bucket}" --query='length(DeleteMarkers[*] || `[]` )')
        if [[ "$NB_OBJECTS" != "0" ]]; then
        while [[ $NB_OBJECTS -gt 0 ]]
        do
            aws s3api delete-objects --bucket "${bucket}" --delete "$(aws s3api list-object-versions --bucket "${bucket}" --max-items 500 --query='{Objects: DeleteMarkers[0:500].{Key:Key,VersionId:VersionId}}')" --query 'length(Deleted[*] || `[]` )' > /dev/null
            NB_OBJECTS=$((NB_OBJECTS  > 500 ? NB_OBJECTS - 500 : 0))
        done
        fi

        echo "Deleting bucket $bucket"
        aws s3api delete-bucket --bucket "$bucket"
    done
}

function delete_artifacts(){
    echo "Deleting Artifacts (CodeCommit, ECR)"

    echo "Deleting CodeCommit Repo"
    aws codecommit delete-repository --repository-name "aws-accelerator-config" --no-cli-pager

    echo "Deleting ECR Repo"
    aws ecr delete-repository --repository-name "cdk-accel-container-assets-$ACCOUNT_ID-$AWS_DEFAULT_REGION" --no-cli-pager
}

function delete_kms(){
    echo "Deleting KMS Keys"

    # delete keys in us-east-1
    KMS_KEYS=$(aws kms list-keys --region us-east-1 --output text)

    for KEY in $KMS_KEYS; do

        # check key description
        RES=$(aws kms describe-key --region us-east-1 --key-id "$KEY" --no-paginate --query 'KeyMetadata.Description' --output text)

        if [[ "$RES" == *"AWS Accelerator"* ]]; then
            echo "deleting key with description $RES"
            aws kms disable-key --region us-east-1 --key-id "$KEY" --no-cli-pager
            aws kms schedule-key-deletion --region us-east-1 --key-id "$KEY" --pending-window-in-days 7 --no-cli-pager
        fi

    done

    KMS_KEYS=$(aws kms list-keys --output text)

    for KEY in $KMS_KEYS; do

        # check key description
        RES=$(aws kms describe-key --key-id "$KEY" --no-paginate --query 'KeyMetadata.Description' --output text 2> /dev/null)

        if [[ "$RES" == *"AWS Accelerator"* || "$RES" == "Key used to encrypt solution assets" || "$RES" == "Key used to encrypt centralized CDK assets" ]]; then
            echo "deleting key with description $RES"
            aws kms disable-key --key-id "$KEY" --no-cli-pager
            aws kms schedule-key-deletion --key-id "$KEY" --pending-window-in-days 7 --no-cli-pager
        fi

    done
}

function delete_guard_duty() {
    echo "delete guardduty configuration"

    # aws cli organizations get root id
    ROOT_ID=$(aws organizations list-roots | jq -r '.Roots | .[] | .Id')

    # aws organizations get organization unit with name Security
    SECURITY_ID=$(aws organizations list-organizational-units-for-parent --parent-id "$ROOT_ID" | jq -r '.OrganizationalUnits | .[] | select(.Name=="Security") | .Id')

    AUDIT_ACCOUNT=$(aws organizations list-accounts-for-parent --parent-id "$SECURITY_ID" | jq -r '.Accounts | .[] | select(.Name=="Audit") | .Id')

    echo "Deregistering account $AUDIT_ACCOUNT from guardduty"
    aws organizations deregister-delegated-administrator --account-id "$AUDIT_ACCOUNT" --service-principal guardduty.amazonaws.com

    # get all guardduty detectors
    DETECTORS=$(aws guardduty list-detectors --query 'DetectorIds[]' --output text)

    # delete guardduty detectors
    for DETECTOR in $DETECTORS; do
        echo "Deleting Detector $DETECTOR"
        aws guardduty delete-detector --detector-id "$DETECTOR"
    done
}

function delete_master() {
    delete_guard_duty
}

function delete_all_accounts() {
    delete_stacks
    delete_logs
    delete_buckets
    delete_artifacts
    delete_kms
}

function main () {
    MASTER_ACCOUNT_ID=$(aws sts get-caller-identity --query 'Account' --output text)

    MASTER_AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID
    MASTER_AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY
    MASTER_AWS_SESSION_TOKEN=
    MASTER_AWS_DEFAULT_REGION=$AWS_DEFAULT_REGION

    ROOT_ID=$(aws organizations list-roots | jq -r '.Roots | .[] | .Id')

    SECURITY_OU_ID=$(aws organizations list-organizational-units-for-parent --parent-id "$ROOT_ID" | jq -r '.OrganizationalUnits | .[] | select(.Name=="Security") | .Id')

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
            echo "assuming AWSControlTowerExecution role in account $ACCOUNT_ID"
            set_master_credentials

            # get temporary credentials
            TEMP_CREDS=$(aws sts assume-role --role-arn "arn:aws:iam::$ACCOUNT_ID:role/AWSControlTowerExecution" --role-session-name remove-lza-stacks)

            AWS_ACCESS_KEY_ID=$(echo "$TEMP_CREDS" | jq -r '.Credentials.AccessKeyId')
            export AWS_ACCESS_KEY_ID
            AWS_SECRET_ACCESS_KEY=$(echo "$TEMP_CREDS" | jq -r '.Credentials.SecretAccessKey')
            export AWS_SECRET_ACCESS_KEY
            AWS_SESSION_TOKEN=$(echo "$TEMP_CREDS" | jq -r '.Credentials.SessionToken')
            export AWS_SESSION_TOKEN
        fi

        if [ "$ACCOUNT_ID" == "$MASTER_ACCOUNT_ID" ]; then
            delete_master
        fi
        delete_all_accounts
    
    done
}

main

# reset credentials
set_master_credentials