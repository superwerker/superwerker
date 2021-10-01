#!/bin/bash

captcha_api_key=$(aws secretsmanager get-secret-value \
--secret-id /superwerker/tests/2captcha_api_key \
--region eu-west-1 \
--query SecretString --output text)

accounts=$(aws dynamodb query \
--table-name account \
--index-name account_status \
--key-condition-expression "account_status = :name" \
--expression-attribute-values '{":name":{"S":"VENDED"}}' \
--region eu-west-1 \
--output json | jq '.Items[].account_id.S|tonumber')

for stale in ${accounts}
do
    echo $stale
    SUPERWERKER_REGION=eu-west-1 SOURCE_PROFILE=superwerker-test1-master AWS_ACCOUNT_ID=${stale} CAPTCHA_API_KEY=${captcha_api_key} ./terminate-test-env.sh ||
    SUPERWERKER_REGION=eu-east-1 SOURCE_PROFILE=superwerker-test1-master AWS_ACCOUNT_ID=${stale} CAPTCHA_API_KEY=${captcha_api_key} ./terminate-test-env.sh ||
    echo "skipping"
done