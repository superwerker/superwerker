#!/bin/bash
set -euo pipefail

superwerker_region=${SUPERWERKER_REGION:-"eu-central-1"}
git_branch=$(git branch --show-current)

echo AccountId ${AWS_ACCOUNT_ID} - Source Profile ${SOURCE_PROFILE} - Region ${superwerker_region} - Branch ${git_branch}

template_url_prefix=https://superwerker-deployment.s3.amazonaws.com/${git_branch}

aws --profile ${SOURCE_PROFILE} s3 sync ../templates s3://superwerker-deployment/${git_branch}/templates

aws --profile test_account_${AWS_ACCOUNT_ID} --region ${superwerker_region} cloudformation deploy --stack-name superwerker --template-file ../templates/superwerker.template.yaml --parameter-overrides TemplateUrlPrefix=${template_url_prefix} --capabilities CAPABILITY_AUTO_EXPAND CAPABILITY_IAM --no-fail-on-empty-changeset
