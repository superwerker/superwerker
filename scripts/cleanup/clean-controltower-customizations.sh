#!/bin/bash
echo "==================================================="
echo "This script will attempt to delete the control-tower-customizations stack and supporting resources"
echo "It will delete: the Cloudformation Stack and leftover resources (CodeCommit Repo and S3 Buckets)"
echo "This script will NOT delete resources that have been created with the control-tower-customizations pipeline itself"
echo "NOT deleted: Cloudformation StackSets & Service Control Policies"

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

    stackname=$(aws s3api get-bucket-tagging --bucket "$bucket" --query "TagSet[?Key=='aws:cloudformation:stack-name'].Value" --output text)
    if [[ $stackname == "customizations-for-aws-control-tower" ]]; then
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
    fi
done

for bucket in $(aws s3api list-buckets --query "Buckets[?starts_with(Name, 'customizations-for-aws')].Name" --output text); do

    stackname=$(aws s3api get-bucket-tagging --bucket "$bucket" --query "TagSet[?Key=='aws:cloudformation:stack-name'].Value" --output text)
    if [[ $stackname == "customizations-for-aws-control-tower" ]]; then
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
    fi
done