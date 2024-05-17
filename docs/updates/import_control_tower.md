# Importing existing control tower to install superwerker 


prerequisites:
control tower should be updated to the latest version

# Control Tower Configuration

In case you manually changed the control tower landingzone configuration please be aware of the following implications.

### Following configurations will be kept on update
- Control Tower Version
- Security & Sandbox OU Names
- Governed Regions
- Region Deny
- Logging & Access Logging retention

### Following configurations will be overridden on update
- Cloudtrail logging will be enforced
- AWS SSO will be enforced
- KMS encrpytion will be deactivated (will be enabled by default in future version)

## Upgrade instructions

0. Prerequisites:
control tower should be updated to the latest version

1. Open the AWS console of the AWS management account where you installed superwerker
2. Open Cloudshell and paste the following script

```shell

echo "Downloading superwerker Control Tower template"
# TODO create template without bootstrap function (then verify if bootstrap is required)
wget https://superwerker-resources-eu-central-1.s3.eu-central-1.amazonaws.com/1.0.0/73c37c12607f1a22218764ca6693a8ee466a87c5107d86dfe706f72b866b0366.json
mv 73c37c12607f1a22218764ca6693a8ee466a87c5107d86dfe706f72b866b0366.json control_tower_template.json

echo "Creating Change Set" 
# TODO emails configurable
export AUDIT_ACCOUNT_ID=$(echo $LZ_MANIFEST | jq -r '.landingZone.manifest.securityRoles.accountId')
export AUDIT_ACCOUNT_MAIL=peer.mueller+87sdf870-b@kreuzwerker.de
export LOG_ARCHIVE_ACCOUNT_ID=$(echo $LZ_MANIFEST | jq -r '.landingZone.manifest.centralizedLogging.accountId')
export LOG_ARCHIVE_ACCOUNT_MAIL=peer.mueller+87dsfgd870-b@kreuzwerker.de
export AUDIT_ACCOUNT_SSM_PARAMETER="/superwerker/account_id_audit"
export LOG_ARCHIVE_ACCOUNT_SSM_PARAMETER="/superwerker/account_id_logarchive"
export CONTROL_TOWER_STACK="superwerker-ControlTower"
aws ssm put-parameter --type String --overwrite --name "${AUDIT_ACCOUNT_SSM_PARAMETER}" --value "${AUDIT_ACCOUNT_ID}" --description "(superwerker) Account Id of Audit Account"
aws ssm put-parameter --type String --overwrite --name "${LOG_ARCHIVE_ACCOUNT_SSM_PARAMETER}" --value "${LOG_ARCHIVE_ACCOUNT_ID}" --description "(superwerker) Account Id of Audit Account"
aws cloudformation create-change-set --stack-name ${CONTROL_TOWER_STACK} --change-set-name ImportChangeSet --change-set-type IMPORT --resources-to-import "[{\"ResourceType\":\"AWS::Organizations::Account\",\"LogicalResourceId\":\"AuditAccount\",\"ResourceIdentifier\":{\"AccountId\":\"${AUDIT_ACCOUNT_ID}\"}}, {\"ResourceType\":\"AWS::Organizations::Account\",\"LogicalResourceId\":\"LogArchiveAccount\",\"ResourceIdentifier\":{\"AccountId\":\"${LOG_ARCHIVE_ACCOUNT_ID}\"}}, {\"ResourceType\":\"AWS::ControlTower::LandingZone\",\"LogicalResourceId\":\"LandingZone\",\"ResourceIdentifier\":{\"LandingZoneIdentifier\":\"${LZ_ID}\"}},{\"ResourceType\":\"AWS::SSM::Parameter\",\"LogicalResourceId\":\"AuditAccountParameter\",\"ResourceIdentifier\":{\"Name\":\"${AUDIT_ACCOUNT_SSM_PARAMETER}\"}}, {\"ResourceType\":\"AWS::SSM::Parameter\",\"LogicalResourceId\":\"LogArchiveAccountParameter\",\"ResourceIdentifier\":{\"Name\":\"${LOG_ARCHIVE_ACCOUNT_SSM_PARAMETER}\"}}, {\"ResourceType\":\"AWS::IAM::Role\",\"LogicalResourceId\":\"AWSControlTowerCloudTrailRole\",\"ResourceIdentifier\":{\"RoleName\":\"AWSControlTowerCloudTrailRole\"}}, {\"ResourceType\":\"AWS::IAM::Role\",\"LogicalResourceId\":\"AWSControlTowerAdmin\",\"ResourceIdentifier\":{\"RoleName\":\"AWSControlTowerAdmin\"}}, {\"ResourceType\":\"AWS::IAM::Role\",\"LogicalResourceId\":\"AWSControlTowerConfigAggregatorRoleForOrganizations\",\"ResourceIdentifier\":{\"RoleName\":\"AWSControlTowerConfigAggregatorRoleForOrganizations\"}}, {\"ResourceType\":\"AWS::IAM::Role\",\"LogicalResourceId\":\"AWSControlTowerStackSetRole\",\"ResourceIdentifier\":{\"RoleName\":\"AWSControlTowerStackSetRole\"}}]" --parameter ParameterKey=LogArchiveAWSAccountEmail,ParameterValue=${LOG_ARCHIVE_ACCOUNT_MAIL} ParameterKey=AuditAWSAccountEmail,ParameterValue=${AUDIT_ACCOUNT_MAIL} ParameterKey=GovernedRegionsParameterLookupParameter,ParameterValue=\"/superwerker/controltower/regions\" --capabilities "CAPABILITY_NAMED_IAM"  --template-body file://control_tower_template.json
```

3. After the change set has been created verify it
```shell
aws cloudformation describe-change-set --change-set-name ImportChangeSet --stack-name ${CONTROL_TOWER_STACK}
```

4. Execute the change set to import the resources. This may take a while (20 minutes to 2 hours).
```shell
aws cloudformation execute-change-set --change-set-name ImportChangeSet --stack-name ${CONTROL_TOWER_STACK}
```

5. Do a easily removable change by adding an output to the stack to move it out of IMPORT_COMPLETE state
```shell
# TODO create template with additional output field
aws cloudformation create-change-set --stack-name ${CONTROL_TOWER_STACK} --use-previous-template --change-set-name AddTag --parameter ParameterKey=LogArchiveAWSAccountEmail,ParameterValue=${LOG_ARCHIVE_ACCOUNT_MAIL} ParameterKey=AuditAWSAccountEmail,ParameterValue=${AUDIT_ACCOUNT_MAIL} ParameterKey=GovernedRegionsParameterLookupParameter,ParameterValue=\"/superwerker/controltower/regions\" --tags --capabilities "CAPABILITY_NAMED_IAM"  

aws cloudformation execute-change-set --change-set-name AddTag --stack-name ${CONTROL_TOWER_STACK}
```

5. Download the superwerker template.
```shell
# TODO create template with only control tower stack
wget https://superwerker-release.s3.eu-central-1.amazonaws.com/1.0.0/templates/SuperwerkerStack.template.json
```

6. Create superwerker stack (without extra features) while importing control tower stack only
```shell
# TODO domain configurable
export DOMAIN="superwerker.aws.ffm.kreuzwerker.de"
export SUBDOMAIN="standalone-05"
export NOTIFICATIONS_MAIL=""
export CONTROL_TOWER_STACK_ARN=$(aws cloudformation list-stacks --stack-status-filter "CREATE_COMPLETE" "IMPORT_ROLLBACK_COMPLETE" "UPDATE_COMPLETE" "IMPORT_COMPLETE" "ROLLBACK_COMPLETE" "UPDATE_ROLLBACK_COMPLETE" --query "StackSummaries[?starts_with(StackName, '${CONTROL_TOWER_STACK}')].StackId" --output text)

aws cloudformation create-change-set --stack-name superwerker --change-set-name ImportControlTower --change-set-type IMPORT --resources-to-import "[{\"ResourceType\":\"AWS::CloudFormation::Stack\",\"LogicalResourceId\":\"ControlTower\",\"ResourceIdentifier\":{\"StackId\":\"${CONTROL_TOWER_STACK_ARN}\"}}]" --parameter ParameterKey=Domain,ParameterValue=${DOMAIN} ParameterKey=Subdomain,ParameterValue=${SUBDOMAIN} ParameterKey=NotificationsMail,ParameterValue=${NOTIFICATIONS_MAIL} ParameterKey=IncludeBudget,ParameterValue=No ParameterKey=IncludeGuardDuty,ParameterValue=No ParameterKey=IncludeSecurityHub,ParameterValue=No ParameterKey=IncludeBackup,ParameterValue=No ParameterKey=IncludeServiceControlPolicies,ParameterValue=No --capabilities "CAPABILITY_NAMED_IAM"  --template-body file://SuperwerkerStack.template.json

aws cloudformation execute-change-set --change-set-name ImportControlTower --stack-name superwerker
```

7. Update superwerker stack using all stacks (without extra features)

```shell
# TODO update template to use existing emails from accounts as generating new ones will fail on the accounts (root required)
aws cloudformation create-change-set --stack-name superwerker --change-set-name UpdateSuperwerker --parameter ParameterKey=Domain,ParameterValue=${DOMAIN} ParameterKey=Subdomain,ParameterValue=${SUBDOMAIN} ParameterKey=NotificationsMail,ParameterValue=${NOTIFICATIONS_MAIL} ParameterKey=IncludeBudget,ParameterValue=No ParameterKey=IncludeGuardDuty,ParameterValue=No ParameterKey=IncludeSecurityHub,ParameterValue=No ParameterKey=IncludeBackup,ParameterValue=No ParameterKey=IncludeServiceControlPolicies,ParameterValue=No --capabilities "CAPABILITY_NAMED_IAM" "CAPABILITY_AUTO_EXPAND" --template-body file://path-to-updated-relerase-template

aws cloudformation execute-change-set --change-set-name UpdateSuperwerker --stack-name superwerker
```


