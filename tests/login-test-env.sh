#!/bin/bash

# Open AWS Consolelogged in into test account AWS_ACCOUNT_ID

set -euo pipefail

superwerker_region=${SUPERWERKER_REGION:-"eu-central-1"}

echo AccountId ${AWS_ACCOUNT_ID} - Source Profile ${SOURCE_PROFILE} - Region ${superwerker_region}

# setup AWS CLI to talk to vended account
aws_cross_account_role_arn="arn:aws:iam::${AWS_ACCOUNT_ID}:role/OVMCrossAccountRole"
aws configure --profile test_account_${AWS_ACCOUNT_ID} --region ${superwerker_region} set role_arn $aws_cross_account_role_arn
aws configure --profile test_account_${AWS_ACCOUNT_ID} --region ${superwerker_region} set source_profile ${SOURCE_PROFILE}

# open Firefox
open -a Firefox $(AWS_PROFILE=test_account_${AWS_ACCOUNT_ID} python3 ${BASH_SOURCE%/*}/../scripts/console.py)