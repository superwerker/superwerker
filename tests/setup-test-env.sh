#!/bin/bash
set -euo pipefail

echo SOURCE_PROFILE: $SOURCE_PROFILE
echo ROOT_MAIL_DOMAIN: $ROOT_MAIL_DOMAIN
echo TEMPLATE_BUCKET_NAME: $TEMPLATE_BUCKET_NAME
echo TEMPLATE_REGION: $TEMPLATE_REGION
echo TEMPLATE_PREFIX: $TEMPLATE_PREFIX

superwerker_region=${SUPERWERKER_REGION:-"eu-central-1"}

# check if source profile works
aws sts get-caller-identity --profile $SOURCE_PROFILE --no-cli-pager

# vend fresh account/org if not set

aws_account_id=${AWS_ACCOUNT_ID:-""}

git_branch=$(git branch --show-current)
git_revision=$(git rev-parse ${git_branch})

if [ "$aws_account_id" == "" ]; then
  echo ORGANIZATIONS_VENDING_MACHINE_ENDPOINT: $ORGANIZATIONS_VENDING_MACHINE_ENDPOINT
  ovm_result=$(curl --fail --retry 10 -s ${ORGANIZATIONS_VENDING_MACHINE_ENDPOINT})
  aws_account_id=$(echo $ovm_result | jq -r .account_id)
  aws_cross_account_role_arn=$(echo $ovm_result | jq -r .cross_account_role)
else
  aws_cross_account_role_arn="arn:aws:iam::${aws_account_id}:role/OVMCrossAccountRole"
fi
echo AccountId ${aws_account_id} - Cross Account Role ${aws_cross_account_role_arn} - Region ${superwerker_region} - Branch ${git_branch} - Git Revision ${git_revision}

# setup AWS CLI to talk to vended account
aws configure --profile test_account_${aws_account_id} --region ${superwerker_region} set role_arn $aws_cross_account_role_arn
aws configure --profile test_account_${aws_account_id} --region ${superwerker_region} set source_profile ${SOURCE_PROFILE}
aws sts get-caller-identity --profile test_account_${aws_account_id} --region ${superwerker_region} --no-cli-pager

git push origin ${git_branch}

# setup superwerker in vended account
aws --profile test_account_${aws_account_id} --region ${superwerker_region} cloudformation create-stack --stack-name superwerker --template-body file://templates/superwerker.template.yaml --parameters ParameterKey=Domain,ParameterValue=${ROOT_MAIL_DOMAIN} ParameterKey=Subdomain,ParameterValue=${aws_account_id} ParameterKey=QSS3BucketName,ParameterValue=${TEMPLATE_BUCKET_NAME} ParameterKey=QSS3BucketRegion,ParameterValue=${TEMPLATE_REGION} ParameterKey=QSS3KeyPrefix,ParameterValue=${TEMPLATE_PREFIX} ParameterKey=NotificationsMail,ParameterValue=root+notifications@${aws_account_id}.${ROOT_MAIL_DOMAIN} ParameterKey=OverrideSourceVersion,ParameterValue=${git_revision} --capabilities CAPABILITY_AUTO_EXPAND CAPABILITY_IAM --disable-rollback --no-cli-pager
while ! domain_name_servers=$(aws --profile test_account_${aws_account_id} --region ${superwerker_region} ssm get-parameter --name /superwerker/domain_name_servers --query Parameter.Value --output text); do sleep 10; done
aws --profile ${SOURCE_PROFILE} cloudformation deploy --stack-name superwerker-pipeline-dns-wiring-${aws_account_id} --template-file tests/pipeline-dns-wiring.yaml --parameter-overrides RootMailDelegationTarget=$domain_name_servers RootMailDomain=${ROOT_MAIL_DOMAIN} RootMailSubdomain=${aws_account_id} --no-fail-on-empty-changeset
sleep 1800 # give superwerker stack time to finish (Control Tower needs ~30min)
aws --profile test_account_${aws_account_id} --region ${superwerker_region} cloudformation wait stack-create-complete --stack-name superwerker

aws --profile test_account_${aws_account_id} --region ${superwerker_region} cloudformation deploy --stack-name superwerker-pipeline-account-factory-wiring --template-file tests/account-factory-wiring.yaml --parameter-overrides PipelineCloudformationRoleArn=$aws_cross_account_role_arn --capabilities CAPABILITY_AUTO_EXPAND CAPABILITY_IAM --no-fail-on-empty-changeset
aws --profile test_account_${aws_account_id} --region ${superwerker_region} cloudformation deploy --stack-name superwerker-pipeline-account-factory-fixture --template-file tests/account-factory.yaml --parameter-overrides AccountName=sw-${aws_account_id} AccountEmail=root+test@${aws_account_id}.${ROOT_MAIL_DOMAIN} SSOUserFirstName=Isolde SSOUserLastName=Mawidder-Baden SSOUserEmail=root+test@${aws_account_id}.${ROOT_MAIL_DOMAIN} ManagedOrganizationalUnit=Sandbox --capabilities CAPABILITY_AUTO_EXPAND CAPABILITY_IAM --no-fail-on-empty-changeset
