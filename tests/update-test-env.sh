#!/bin/bash
set -euo pipefail

template_bucket_name=superwerker-deployment
template_region=eu-west-1

superwerker_region=${SUPERWERKER_REGION:-"eu-central-1"}
git_branch=$(git branch --show-current)
git_revision=$(git rev-parse ${git_branch})

echo AccountId ${AWS_ACCOUNT_ID} - Source Profile ${SOURCE_PROFILE} - Region ${superwerker_region} - Branch ${git_branch} - Git Revision ${git_revision}

template_bucket_name=superwerker-deployment
template_region=eu-west-1
template_prefix=${git_branch}/

aws --profile ${SOURCE_PROFILE} s3 sync ../templates s3://superwerker-deployment/${git_branch}/templates

git push origin ${git_branch}
aws --profile test_account_${AWS_ACCOUNT_ID} --region ${superwerker_region} cloudformation update-stack --stack-name superwerker --template-body file://../templates/superwerker.template.yaml --parameters ParameterKey=Domain,UsePreviousValue=true ParameterKey=Subdomain,UsePreviousValue=true ParameterKey=QSS3BucketName,UsePreviousValue=true ParameterKey=QSS3BucketRegion,UsePreviousValue=true ParameterKey=QSS3KeyPrefix,UsePreviousValue=true ParameterKey=NotificationsMail,UsePreviousValue=true ParameterKey=OverrideSourceVersion,ParameterValue=${git_revision} --capabilities CAPABILITY_AUTO_EXPAND CAPABILITY_IAM --disable-rollback
