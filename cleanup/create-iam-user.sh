#!/bin/bash
set +x

# aws cli lookup IAM user called lz-cleanup
aws iam get-user --user-name lz-cleanup

# if already exists, delete it
if [ $? -eq 0 ]; then
    # detele access keys from user
    aws iam list-access-keys --user-name lz-cleanup | jq -r '.AccessKeyMetadata | .[] | .AccessKeyId' | xargs -I {} aws iam delete-access-key --user-name lz-cleanup --access-key-id {}
    # detach policy from user
    aws iam detach-user-policy --user-name lz-cleanup --policy-arn arn:aws:iam::aws:policy/AdministratorAccess
    aws iam delete-user --user-name lz-cleanup
fi

# create clean up user
aws iam create-user --user-name lz-cleanup

# aws cli add admin permissions to role
aws iam attach-user-policy --user-name lz-cleanup --policy-arn arn:aws:iam::aws:policy/AdministratorAccess

# aws cli create access key
aws iam create-access-key --user-name lz-cleanup > lz-cleanup-access-key.json

# print credentials
ACCESSKEY=$(cat lz-cleanup-access-key.json | jq -r '.AccessKey | .AccessKeyId')
SECRECTKEY=$(cat lz-cleanup-access-key.json | jq -r '.AccessKey | .SecretAccessKey')
AWSREGION=$(aws ec2 describe-availability-zones --output text --query 'AvailabilityZones[0].[RegionName]')
cat << EOF

Copy the following credentials to your terminal:
================================================

export AWS_ACCESS_KEY_ID=$ACCESSKEY
export AWS_SECRET_ACCESS_KEY=$SECRECTKEY
export AWS_SESSION_TOKEN=
export AWS_DEFAULT_REGION=$AWSREGION

================================================
EOF
