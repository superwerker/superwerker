#!/bin/bash
set -euo pipefail

echo SOURCE_PROFILE: $SOURCE_PROFILE
echo AWS_ACCOUNT_ID: $AWS_ACCOUNT_ID

superwerker_region=${SUPERWERKER_REGION:-"eu-central-1"}

# check if source profile works
aws sts get-caller-identity --profile $SOURCE_PROFILE --no-cli-pager >/dev/null

aws_cross_account_role_arn="arn:aws:iam::${AWS_ACCOUNT_ID}:role/OVMCrossAccountRole"

echo AccountId ${AWS_ACCOUNT_ID} - Cross Account Role ${aws_cross_account_role_arn} - Region ${superwerker_region}

# setup AWS CLI to talk to vended account
aws configure --profile test_account_${AWS_ACCOUNT_ID} --region ${superwerker_region} set role_arn $aws_cross_account_role_arn
aws configure --profile test_account_${AWS_ACCOUNT_ID} --region ${superwerker_region} set source_profile ${SOURCE_PROFILE}
aws sts get-caller-identity --profile test_account_${AWS_ACCOUNT_ID} --region ${superwerker_region} --no-cli-pager >/dev/null

# Node + AWS SSO + Assume Role doesn't seem to work, so work around by setting credentials
eval $(aws sts assume-role --profile $SOURCE_PROFILE --role-arn $aws_cross_account_role_arn --role-session-name test | jq -r '.Credentials | "export JS_AWS_ACCESS_KEY_ID=\(.AccessKeyId)\nexport JS_AWS_SECRET_ACCESS_KEY=\(.SecretAccessKey)\nexport JS_AWS_SESSION_TOKEN=\(.SessionToken)\n"')
AWS_ACCESS_KEY_ID=$JS_AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY=$JS_AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN=$JS_AWS_SESSION_TOKEN AWS_REGION=${superwerker_region} npx cdk $*
