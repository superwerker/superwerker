#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

echo SOURCE_PROFILE: $SOURCE_PROFILE

captcha_api_key=$(aws secretsmanager get-secret-value \
--profile $SOURCE_PROFILE \
--secret-id /superwerker/tests/2captcha_api_key \
--region eu-west-1 \
--query SecretString --output text)

accounts=$(aws dynamodb query \
--profile $SOURCE_PROFILE \
--table-name account \
--index-name account_status \
--key-condition-expression "account_status = :name" \
--expression-attribute-values '{":name":{"S":"VENDED"}}' \
--query 'Items[].[account_id.S]' \
--region eu-west-1 \
--output text)

for stale in ${accounts}
do
    echo $stale
    SOURCE_PROFILE=superwerker-test1-master AWS_ACCOUNT_ID="${stale}" CAPTCHA_API_KEY=${captcha_api_key} $SCRIPT_DIR/terminate-test-env.sh
done