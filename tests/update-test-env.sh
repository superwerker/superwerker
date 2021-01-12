#!/bin/bash
set -euo pipefail

echo AWS_ACCOUNT_ID: $AWS_ACCOUNT_ID

git_branch=$(git branch --show-current)
template_url_prefix=https://superwerker-deployment.s3.amazonaws.com/${git_branch}

aws s3 sync ../components s3://superwerker-deployment/${git_branch}/components

aws --profile test_account_${AWS_ACCOUNT_ID} cloudformation deploy --stack-name superwerker --template-file ../components/superwerker.yaml --parameter-overrides TemplateUrlPrefix=${template_url_prefix} --capabilities CAPABILITY_AUTO_EXPAND CAPABILITY_IAM --no-fail-on-empty-changeset
