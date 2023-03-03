#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

superwerker_region=${SUPERWERKER_REGION:-"eu-central-1"}
git_long_commit_hash=$(git rev-parse HEAD)


TEMPLATE_PREFIX=build/${git_long_commit_hash}
# used in 'yarn synth'
export SUPERWERKER_VERSION=${git_long_commit_hash}

cd ${SCRIPT_DIR}/../cdk
yarn
yarn synth

# if you have to assume a role in the 'SuperwerkerTestMaster' AWS account
if [ -n "${ROLE_TO_ASSUME}" ]; then
    echo AccountId ${AWS_ACCOUNT_ID} - Source Profile ${SOURCE_PROFILE} with role to assume ${ROLE_TO_ASSUME} - Region ${superwerker_region} - Git Hash ${git_long_commit_hash}
    
    TMP_AWS_SW_CREDENTIALS=$(aws sts assume-role --profile ${SOURCE_PROFILE} --role-arn "arn:aws:iam::824014778649:role/${ROLE_TO_ASSUME}" --role-session-name test-stack-update)
    export AWS_ACCESS_KEY_ID=$(echo "$TMP_AWS_SW_CREDENTIALS" | jq -r '.Credentials.AccessKeyId' | tr -d '\r\n')
    export AWS_SECRET_ACCESS_KEY=$(echo "$TMP_AWS_SW_CREDENTIALS" | jq -r '.Credentials.SecretAccessKey' | tr -d '\r\n')
    export AWS_SESSION_TOKEN=$(echo "$TMP_AWS_SW_CREDENTIALS" | jq -r '.Credentials.SessionToken' | tr -d '\r\n')
else 
    echo AccountId ${AWS_ACCOUNT_ID} - Source Profile ${SOURCE_PROFILE} - Region ${superwerker_region} - Git Hash ${git_long_commit_hash}
fi

# as the script needs to have the AWS_ACCESS_KEY_ID etc. to be set
yarn publish-assets

# from buildspec.yaml an we use the same credentials like for 'yarn publish-assets'
aws s3 cp ${SCRIPT_DIR}/../cdk/cdk.out/SuperwerkerStack.template.json s3://superwerker-deployment/${TEMPLATE_PREFIX}/templates/superwerker.template.yaml
aws s3 cp ${SCRIPT_DIR}/../cdk/cdk.out/SuperwerkerStack.template.json s3://superwerker-deployment/${TEMPLATE_PREFIX}/templates/

# clean the temporary credentials
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN

echo "----------------------------------------------------------------"
echo "NOTE: for now update the stack by hand in firefox with new template url 'https://superwerker-deployment.s3.${superwerker_region}.amazonaws.com/${TEMPLATE_PREFIX}/templates/SuperwerkerStack.template.json'"
# we update the stack in the AWS account under test
#aws --profile test_account_${AWS_ACCOUNT_ID} --region ${superwerker_region} cloudformation update-stack --stack-name superwerker --template-url "https://superwerker-deployment.s3.${superwerker_region}.amazonaws.com/${TEMPLATE_PREFIX}/templates/SuperwerkerStack.template.json"  --capabilities CAPABILITY_AUTO_EXPAND CAPABILITY_IAM --no-cli-pager                                                                                                                                          