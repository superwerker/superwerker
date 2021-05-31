#!/bin/bash
set -euo pipefail

ovm_result=$(curl --fail --retry 10 -s ${ORGANIZATIONS_VENDING_MACHINE_ENDPOINT})
aws_account_id=$(echo $ovm_result | jq -r .account_id)
aws_cross_account_role_arn=$(echo $ovm_result | jq -r .cross_account_role)

echo AccountId ${aws_account_id} - Cross Account Role ${aws_cross_account_role_arn}
