#!/bin/bash
echo "==================================================="
echo "This script will attempt to delete the control-tower-customizations stack and supporting resources"
echo "This script will NOT delete resources that have been created with the control-tower-customizations pipeline itself besides the inital resources"
echo "If you encounter 'OperationInProgressException' wait a few seconds and run the script again"

read -p "Do you wish to continue? (y/n) " -n 1 -r
if [[ ! $REPLY =~ ^[Yy]$ ]]
then
    printf "\nExiting script\n"
    exit 1
else
    printf "\nStarting deletion\n"
fi

# check if variable empty
if [ -z "$AWS_REGION" ]; then
    echo "error: you must set AWS_REGION environment variable e.g. AWS_REGION=eu-central-1"
    exit 1
fi

STACK_NAME="customizations-for-aws-control-tower"
REPO_NAME="custom-control-tower-configuration"

echo "Deleting stack $STACK_NAME, this will take a few minutes, please wait..."
aws cloudformation delete-stack --stack-name $STACK_NAME
aws cloudformation wait stack-delete-complete --stack-name $STACK_NAME

echo "Deleting CodeCommit Repo"
aws codecommit delete-repository --repository-name $REPO_NAME

echo "Emptying and deleting Buckets"

for bucket in $(aws s3api list-buckets --query "Buckets[?starts_with(Name, 'custom-control-tower-configuration')].Name" --output text); do

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

for bucket in $(aws s3api list-buckets --query "Buckets[?starts_with(Name, 'customizations-for-aws-')].Name" --output text); do

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

# Delete Stackset
STACK_SETS=$(aws cloudformation list-stack-sets --status ACTIVE --query 'Summaries[?starts_with(StackSetName, `CustomControlTower-`)].StackSetName' --no-paginate  --output text)

for STACK_SET in $STACK_SETS; do
    
    ACCOUNTS=$(aws cloudformation list-stack-instances --stack-set-name "$STACK_SET" --query 'Summaries[].Account' --no-cli-pager --output text)

    if [[ $ACCOUNTS ]]; then
        echo "Deleting Stack Set Instances for $STACK_SET"
        OPERATION_ID=$(aws cloudformation delete-stack-instances --stack-set-name "$STACK_SET" --accounts "[\"${ACCOUNTS//$'\t'/\", \"}\"]" --regions "$AWS_DEFAULT_REGION" --no-cli-pager --output text)
    fi

    echo "Deleting Stack Set $STACK_SET"
    aws cloudformation delete-stack-set --stack-set-name "$STACK_SET" --no-cli-pager --output text

done

# Delete SCPs
SCPS=$(aws organizations list-policies --filter SERVICE_CONTROL_POLICY --query 'Policies[?starts_with(Name, `superwerker-cfct-`)].Id' --no-cli-pager --output text)

for SCP in $SCPS; do

    # list targets
    TARGETS=$(aws organizations list-targets-for-policy --policy-id "$SCP" --query 'Targets[?starts_with(TargetId, `ou-`)].TargetId' --no-cli-pager --output text)

    # detach targets
    for TARGET in $TARGETS; do
        echo "Detaching target $TARGET from SCP $SCP"
        aws organizations detach-policy --policy-id "$SCP" --target-id "$TARGET" --no-cli-pager --output text
    done

    echo "Deleting SCP $SCP"
    aws organizations delete-policy --policy-id "$SCP" --no-cli-pager --output text
done
