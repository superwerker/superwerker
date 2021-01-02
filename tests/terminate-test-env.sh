#!/bin/bash
set -euo pipefail

echo SOURCE_PROFILE: $SOURCE_PROFILE
echo AWS_ACCOUNT_ID: $AWS_ACCOUNT_ID
echo CAPTCHA_API_KEY: $CAPTCHA_API_KEY

# check if source profile works
aws sts get-caller-identity --profile $SOURCE_PROFILE --no-cli-pager

aws_cross_account_role_arn="arn:aws:iam::${AWS_ACCOUNT_ID}:role/OVMCrossAccountRole"

echo AccountId ${AWS_ACCOUNT_ID} - Cross Account Role ${aws_cross_account_role_arn}

# setup AWS CLI to talk to vended account
aws configure --profile test_account_${AWS_ACCOUNT_ID} set role_arn $aws_cross_account_role_arn
aws configure --profile test_account_${AWS_ACCOUNT_ID} set source_profile ${SOURCE_PROFILE}
aws sts get-caller-identity --profile test_account_${AWS_ACCOUNT_ID} --no-cli-pager

# close sub-accounts so that the OVM can close the main / management account later
cd tests/close-active-subaccounts
npm i
# Node + ECS Container Creds + Assume Role doesn't seem to work, so work around by setting credentials
eval $(aws sts assume-role --role-arn $aws_cross_account_role_arn --role-session-name test | jq -r '.Credentials | "export JS_AWS_ACCESS_KEY_ID=\(.AccessKeyId)\nexport JS_AWS_SECRET_ACCESS_KEY=\(.SecretAccessKey)\nexport JS_AWS_SESSION_TOKEN=\(.SessionToken)\n"')
AWS_ACCESS_KEY_ID=$JS_AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY=$JS_AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN=$JS_AWS_SESSION_TOKEN CAPTCHA_KEY=$CAPTCHA_API_KEY node close-active-subaccounts.js

# remove stacks
aws cloudformation delete-stack --stack-name superwerker-pipeline-dns-wiring-${AWS_ACCOUNT_ID}  --no-cli-pager
aws --profile test_account_${AWS_ACCOUNT_ID} cloudformation delete-stack --stack-name superwerker  --no-cli-pager
