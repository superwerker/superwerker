#!/bin/bash
set -euo pipefail

template_bucket_name=superwerker-deployment
template_region=eu-west-1

superwerker_region=${SUPERWERKER_REGION:-"eu-central-1"}
git_branch=$(git branch --show-current)

echo AccountId ${AWS_ACCOUNT_ID} - Source Profile ${SOURCE_PROFILE} - Region ${superwerker_region} - Branch ${git_branch}

template_bucket_name=superwerker-deployment
template_region=eu-west-1
template_prefix=${git_branch}/

aws --profile ${SOURCE_PROFILE} s3 sync ../templates s3://superwerker-deployment/${git_branch}/templates

aws --profile test_account_${AWS_ACCOUNT_ID} --region ${superwerker_region} cloudformation deploy --stack-name superwerker --template-file ../templates/superwerker.template.yaml --parameter-overrides QSS3BucketName=${template_bucket_name} QSS3BucketRegion=${template_region} QSS3KeyPrefix=${template_prefix} --capabilities CAPABILITY_AUTO_EXPAND CAPABILITY_IAM --no-fail-on-empty-changeset
