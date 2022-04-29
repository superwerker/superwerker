#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

echo SOURCE_PROFILE: $SOURCE_PROFILE
echo AWS_ACCOUNT_ID: $AWS_ACCOUNT_ID
echo CAPTCHA_API_KEY: $CAPTCHA_API_KEY

# check if source profile works
aws sts get-caller-identity --profile $SOURCE_PROFILE --no-cli-pager

aws_cross_account_role_arn="arn:aws:iam::${AWS_ACCOUNT_ID}:role/OVMCrossAccountRole"

echo AccountId ${AWS_ACCOUNT_ID} - Cross Account Role ${aws_cross_account_role_arn}

# setup AWS CLI to talk to vended account
aws configure --profile test_account_${AWS_ACCOUNT_ID} set role_arn ${aws_cross_account_role_arn}
aws configure --profile test_account_${AWS_ACCOUNT_ID} set source_profile ${SOURCE_PROFILE}
aws sts get-caller-identity --profile test_account_${AWS_ACCOUNT_ID} --no-cli-pager
for superwerker_region_to_discover in eu-west-1 eu-central-1; do
    if aws --profile test_account_${AWS_ACCOUNT_ID} --region ${superwerker_region_to_discover} cloudformation describe-stacks --stack-name superwerker --no-cli-pager >/dev/null 2>&1; then
        superwerker_region=${superwerker_region_to_discover}
        break
    fi
done

if [ -z "${superwerker_region}" ]; then
    echo "No superwerker stack found in any region"
    exit 1
fi

# check if rootmail needs repairing
if ! stack_status=$(aws --profile test_account_${AWS_ACCOUNT_ID} --region ${superwerker_region} cloudformation describe-stacks --stack-name superwerker --no-cli-pager --output text --query 'Stacks[0].StackStatus' 2>/dev/null) || [[ $stack_status == DELETE* ]]; then
  if ! aws --profile test_account_${AWS_ACCOUNT_ID} --region ${superwerker_region} cloudformation describe-stacks --stack-name temp-rootmail --no-cli-pager >/dev/null 2>&1; then
      echo "superwerker stack not existing or deleted ($stack_status), trying to repair rootmail"
      aws --profile test_account_${AWS_ACCOUNT_ID} --region ${superwerker_region} cloudformation create-stack --stack-name temp-rootmail --template-body file://${SCRIPT_DIR}/../templates/rootmail.yaml --parameters ParameterKey=Domain,ParameterValue=${ROOT_MAIL_DOMAIN} ParameterKey=Subdomain,ParameterValue=${AWS_ACCOUNT_ID} --capabilities CAPABILITY_AUTO_EXPAND CAPABILITY_IAM  --no-cli-pager
      while ! domain_name_servers=$(aws --profile test_account_${AWS_ACCOUNT_ID} --region ${superwerker_region} ssm get-parameter --name /superwerker/domain_name_servers --query Parameter.Value --output text 2>/dev/null); do sleep 10; done
      aws --profile ${SOURCE_PROFILE} cloudformation deploy --stack-name superwerker-pipeline-dns-wiring-temp-${AWS_ACCOUNT_ID} --template-file ${SCRIPT_DIR}/pipeline-dns-wiring.yaml --parameter-overrides RootMailDelegationTarget=$domain_name_servers RootMailDomain=${ROOT_MAIL_DOMAIN} RootMailSubdomain=${AWS_ACCOUNT_ID} --no-fail-on-empty-changeset
      aws --profile test_account_${AWS_ACCOUNT_ID} --region ${superwerker_region} cloudformation wait stack-create-complete --stack-name temp-rootmail
  fi
fi

# close sub-accounts so that the OVM can close the main / management account later
cd $SCRIPT_DIR/close-active-subaccounts
virtualenv venv
source venv/bin/activate
pip install -r requirements.txt

AWS_PROFILE=test_account_${AWS_ACCOUNT_ID} AWS_DEFAULT_REGION=${superwerker_region} AWS_REGION=${superwerker_region} CAPTCHA_KEY=$CAPTCHA_API_KEY python3 close-active-subaccounts.py

# remove stacks
aws cloudformation delete-stack --profile $SOURCE_PROFILE --stack-name superwerker-pipeline-dns-wiring-${AWS_ACCOUNT_ID}  --no-cli-pager
aws --profile test_account_${AWS_ACCOUNT_ID} --region ${superwerker_region} cloudformation delete-stack --stack-name superwerker  --no-cli-pager
aws cloudformation delete-stack --profile $SOURCE_PROFILE --stack-name superwerker-pipeline-dns-wiring-temp-${AWS_ACCOUNT_ID}  --no-cli-pager
aws --profile test_account_${AWS_ACCOUNT_ID} --region ${superwerker_region} cloudformation delete-stack --stack-name temp-rootmail  --no-cli-pager
