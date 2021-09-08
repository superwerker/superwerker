#!/bin/bash

accounts=$(aws dynamodb query \
--table-name account \
--index-name account_status \
--key-condition-expression "account_status = :name" \
--expression-attribute-values '{":name":{"S":"CREATED"}}' \
--max-items 2 \
--region eu-west-1 \
--output json | jq '.Items[].account_id.S')

echo $accounts

for old-account in "${accounts}"
do
    echo "$old-account"
    SUPERWERKER_REGION=eu-central-1 SOURCE_PROFILE=superwerker-test1-master AWS_ACCOUNT_ID=${old-account} CAPTCHA_API_KEY=02432dfb3dd64998a683bc797d1b94f5 ./tests/terminate-test-env.sh
done