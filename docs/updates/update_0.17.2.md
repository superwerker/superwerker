# Upgrading existing superwerker installation from 0.17.2

Since Control Tower is managed by Cloudformation starting from version v1.0.0 (also see [ADR](../adrs/control-tower-cloudformation.md)) all existing resources (Organisation, Security Accounts, Roles, etc.) need to be imported into the existing superwerker stack. Please follow these instructions prior to updating your superwerker installation. If you are coming from a lower version, you need to upgrade to version 0.17.2 first before starting with these upgrade instructions.

## Upgrade instructions

**DISCLAIMER**: The ControlTower import mechanism assumes that the AWS Organisation structure is the same after the initial superwerker installation. This means there are two Organisation Units (OUs) called `Security` and `Sandbox`. Inside the `Security` OU there are two Accounts called `Audit` and `Log Archive`. Additionally, it is assumed that there is an S3 bucket in the account with the prefix `cf-templates`.

1. Open the AWS console of the AWS management account where you installed superwerker
2. Open Cloudshell and paste the following script

```shell
SUPERWERKER_STACK=$(aws cloudformation describe-stacks --stack-name superwerker --query 'Stacks[0].StackId' --output text)

if [ -z "$SUPERWERKER_STACK" ]; then
    echo "No stack with name superwerker found. Please override the SUPERWERKER_STACK environment variable if necessary"
else
    echo "Found superwerker stack. Checking version..."
    SUPERWERKER_VERSION=$(aws cloudformation get-template --stack-name superwerker --query 'TemplateBody.Metadata.SuperwerkerVersion' --output text)
    if [ "$SUPERWERKER_VERSION" != "0.17.2" ]; then
        echo "Superwerker version is not 0.17.2. Please update first to this version before attempting import."
    else
        echo "Found superwerker version 0.17.2. Fetching Control Tower Cloudformation Template..."
        CONTROL_TOWER_STACK=$(aws cloudformation list-stacks --stack-status-filter "CREATE_COMPLETE" "IMPORT_ROLLBACK_COMPLETE" "UPDATE_COMPLETE" "IMPORT_COMPLETE" "ROLLBACK_COMPLETE" "UPDATE_ROLLBACK_COMPLETE" --query "StackSummaries[?starts_with(StackName, '${SUPERWERKER_STACK}-ControlTower')].StackName" --output text)
        echo "Fetching Control Tower Template..."
        aws cloudformation get-template --stack-name ${CONTROL_TOWER_STACK} --output json > control_tower_template.json
        echo "Creating resources_to_import.json"
        echo '"Organization": { "Type": "AWS::Organizations::Organization", "Properties": { "FeatureSet": "ALL" }, "UpdateReplacePolicy": "Retain", "DeletionPolicy": "Retain", "Metadata": { "aws:cdk:path": "SuperwerkerStack/ControlTower/Organization" } }, "LogArchiveAccount": { "Type": "AWS::Organizations::Account", "Properties": { "AccountName": "Log Archive", "Email": { "Ref": "LogArchiveAWSAccountEmail" } }, "DependsOn": [ "Organization" ], "UpdateReplacePolicy": "Retain", "DeletionPolicy": "Retain", "Metadata": { "aws:cdk:path": "SuperwerkerStack/ControlTower/LogArchiveAccount" } }, "LogArchiveAccountParameter": { "Type": "AWS::SSM::Parameter", "Properties": { "Description": "(superwerker) account id of logarchive account", "Name": "/superwerker/account_id_logarchive", "Type": "String", "Value": { "Fn::GetAtt": [ "LogArchiveAccount", "AccountId" ] } }, "UpdateReplacePolicy": "Delete", "DeletionPolicy": "Delete", "Metadata": { "aws:cdk:path": "SuperwerkerStack/ControlTower/LogArchiveAccountParameter/Resource" } }, "AuditAccount": { "Type": "AWS::Organizations::Account", "Properties": { "AccountName": "Audit", "Email": { "Ref": "AuditAWSAccountEmail" } }, "DependsOn": [ "Organization" ], "UpdateReplacePolicy": "Retain", "DeletionPolicy": "Retain", "Metadata": { "aws:cdk:path": "SuperwerkerStack/ControlTower/AuditAccount" } }, "AuditAccountParameter": { "Type": "AWS::SSM::Parameter", "Properties": { "Description": "(superwerker) account id of audit account", "Name": "/superwerker/account_id_audit", "Type": "String", "Value": { "Fn::GetAtt": [ "AuditAccount", "AccountId" ] } }, "UpdateReplacePolicy": "Delete", "DeletionPolicy": "Delete", "Metadata": { "aws:cdk:path": "SuperwerkerStack/ControlTower/AuditAccountParameter/Resource" } }, "AWSControlTowerAdmin": { "Type": "AWS::IAM::Role", "Properties": { "AssumeRolePolicyDocument": { "Statement": [ { "Action": "sts:AssumeRole", "Effect": "Allow", "Principal": { "Service": "controltower.amazonaws.com" } } ], "Version": "2012-10-17" }, "ManagedPolicyArns": [ { "Fn::Join": [ "", [ "arn:", { "Ref": "AWS::Partition" }, ":iam::aws:policy/service-role/AWSControlTowerServiceRolePolicy" ] ] } ], "Path": "/service-role/", "Policies": [ { "PolicyDocument": { "Statement": [ { "Action": "ec2:DescribeAvailabilityZones", "Effect": "Allow", "Resource": "*" } ], "Version": "2012-10-17" }, "PolicyName": "AWSControlTowerAdminPolicy" } ], "RoleName": "AWSControlTowerAdmin" }, "UpdateReplacePolicy": "Delete", "DeletionPolicy": "Delete", "Metadata": { "aws:cdk:path": "SuperwerkerStack/ControlTower/AWSControlTowerAdmin/Resource" } }, "AWSControlTowerCloudTrailRole": { "Type": "AWS::IAM::Role", "Properties": { "AssumeRolePolicyDocument": { "Statement": [ { "Action": "sts:AssumeRole", "Effect": "Allow", "Principal": { "Service": "cloudtrail.amazonaws.com" } } ], "Version": "2012-10-17" }, "Path": "/service-role/", "Policies": [ { "PolicyDocument": { "Statement": [ { "Action": [ "logs:CreateLogStream", "logs:PutLogEvents" ], "Effect": "Allow", "Resource": "arn:aws:logs:*:*:log-group:aws-controltower/CloudTrailLogs:*" } ], "Version": "2012-10-17" }, "PolicyName": "AWSControlTowerCloudTrailRolePolicy" } ], "RoleName": "AWSControlTowerCloudTrailRole" }, "UpdateReplacePolicy": "Delete", "DeletionPolicy": "Delete", "Metadata": { "aws:cdk:path": "SuperwerkerStack/ControlTower/AWSControlTowerCloudTrailRole/Resource" } }, "AWSControlTowerConfigAggregatorRoleForOrganizations": { "Type": "AWS::IAM::Role", "Properties": { "AssumeRolePolicyDocument": { "Statement": [ { "Action": "sts:AssumeRole", "Effect": "Allow", "Principal": { "Service": "config.amazonaws.com" } } ], "Version": "2012-10-17" }, "ManagedPolicyArns": [ { "Fn::Join": [ "", [ "arn:", { "Ref": "AWS::Partition" }, ":iam::aws:policy/service-role/AWSConfigRoleForOrganizations" ] ] } ], "Path": "/service-role/", "RoleName": "AWSControlTowerConfigAggregatorRoleForOrganizations" }, "UpdateReplacePolicy": "Delete", "DeletionPolicy": "Delete", "Metadata": { "aws:cdk:path": "SuperwerkerStack/ControlTower/AWSControlTowerConfigAggregatorRoleForOrganizations/Resource" } }, "AWSControlTowerStackSetRole": { "Type": "AWS::IAM::Role", "Properties": { "AssumeRolePolicyDocument": { "Statement": [ { "Action": "sts:AssumeRole", "Effect": "Allow", "Principal": { "Service": "cloudformation.amazonaws.com" } } ], "Version": "2012-10-17" }, "Path": "/service-role/", "Policies": [ { "PolicyDocument": { "Statement": [ { "Action": "sts:AssumeRole", "Effect": "Allow", "Resource": "arn:aws:iam::*:role/AWSControlTowerExecution" } ], "Version": "2012-10-17" }, "PolicyName": "AWSControlTowerStackSetRolePolicy" } ], "RoleName": "AWSControlTowerStackSetRole" }, "UpdateReplacePolicy": "Delete", "DeletionPolicy": "Delete", "Metadata": { "aws:cdk:path": "SuperwerkerStack/ControlTower/AWSControlTowerStackSetRole/Resource" } }, "LandingZone": { "Type": "AWS::ControlTower::LandingZone", "Properties": { "Manifest": { "governedRegions": [ { "Ref": "AWS::Region" } ], "organizationStructure": { "security": { "name": "Security" }, "sandbox": { "name": "Sandbox" } }, "centralizedLogging": { "accountId": { "Fn::GetAtt": [ "LogArchiveAccount", "AccountId" ] }, "configurations": { "loggingBucket": { "retentionDays": 365 }, "accessLoggingBucket": { "retentionDays": 365 } }, "enabled": true }, "securityRoles": { "accountId": { "Fn::GetAtt": [ "AuditAccount", "AccountId" ] } }, "accessManagement": { "enabled": true } }, "Tags": [ { "Key": "name", "Value": "superwerker" } ], "Version": "3.3" }, "DependsOn": [ "AuditAccount", "AWSControlTowerAdmin", "AWSControlTowerCloudTrailRole", "AWSControlTowerConfigAggregatorRoleForOrganizations", "AWSControlTowerStackSetRole", "LogArchiveAccount", "Organization" ], "UpdateReplacePolicy": "Delete", "DeletionPolicy": "Delete", "Metadata": { "aws:cdk:path": "SuperwerkerStack/ControlTower/LandingZone" } },' > resources_to_import.json
        echo "Updating Control Tower Template"
        sed -i "/\"Resources\"/r resources_to_import.json" control_tower_template.json

        TEMPLATE_BUCKET=$(aws s3api list-buckets --query "Buckets[?starts_with(Name, 'cf-templates')].Name" --output text)

        export ORG_ID=$(aws organizations describe-organization --query "Organization.Id" --output text)
        export LZ_ID=$(aws controltower list-landing-zones --query "landingZones[0].arn" --output text)
        export LZ_MANIFEST=$(aws controltower get-landing-zone --landing-zone-id ${LZ_ID} --no-cli-pager)
        export AUDIT_ACCOUNT_ID=$(echo $LZ_MANIFEST | jq -r '.landingZone.manifest.securityRoles.accountId')
        export AUDIT_ACCOUNT_MAIL=$(aws organizations describe-account --account-id $AUDIT_ACCOUNT_ID | jq -r '.Account.Email')
        export LOG_ARCHIVE_ACCOUNT_ID=$(echo $LZ_MANIFEST | jq -r '.landingZone.manifest.centralizedLogging.accountId')
        export LOG_ARCHIVE_ACCOUNT_MAIL=$(aws organizations describe-account --account-id $LOG_ARCHIVE_ACCOUNT_ID | jq -r '.Account.Email')
        export AUDIT_ACCOUNT_SSM_PARAMETER="/superwerker/account_id_audit"
        export LOG_ARCHIVE_ACCOUNT_SSM_PARAMETER="/superwerker/account_id_logarchive"

        echo "Creating Change Set" 
        aws cloudformation create-change-set --stack-name ${CONTROL_TOWER_STACK} --change-set-name ImportChangeSet --change-set-type IMPORT --resources-to-import "[{\"ResourceType\":\"AWS::Organizations::Organization\",\"LogicalResourceId\":\"Organization\",\"ResourceIdentifier\":{\"Id\":\"${ORG_ID}\"}}, {\"ResourceType\":\"AWS::Organizations::Account\",\"LogicalResourceId\":\"AuditAccount\",\"ResourceIdentifier\":{\"AccountId\":\"${AUDIT_ACCOUNT_ID}\"}}, {\"ResourceType\":\"AWS::Organizations::Account\",\"LogicalResourceId\":\"LogArchiveAccount\",\"ResourceIdentifier\":{\"AccountId\":\"${LOG_ARCHIVE_ACCOUNT_ID}\"}}, {\"ResourceType\":\"AWS::ControlTower::LandingZone\",\"LogicalResourceId\":\"LandingZone\",\"ResourceIdentifier\":{\"LandingZoneIdentifier\":\"${LZ_ID}\"}},{\"ResourceType\":\"AWS::SSM::Parameter\",\"LogicalResourceId\":\"AuditAccountParameter\",\"ResourceIdentifier\":{\"Name\":\"${AUDIT_ACCOUNT_SSM_PARAMETER}\"}}, {\"ResourceType\":\"AWS::SSM::Parameter\",\"LogicalResourceId\":\"LogArchiveAccountParameter\",\"ResourceIdentifier\":{\"Name\":\"${LOG_ARCHIVE_ACCOUNT_SSM_PARAMETER}\"}}, {\"ResourceType\":\"AWS::IAM::Role\",\"LogicalResourceId\":\"AWSControlTowerCloudTrailRole\",\"ResourceIdentifier\":{\"RoleName\":\"AWSControlTowerCloudTrailRole\"}}, {\"ResourceType\":\"AWS::IAM::Role\",\"LogicalResourceId\":\"AWSControlTowerAdmin\",\"ResourceIdentifier\":{\"RoleName\":\"AWSControlTowerAdmin\"}}, {\"ResourceType\":\"AWS::IAM::Role\",\"LogicalResourceId\":\"AWSControlTowerConfigAggregatorRoleForOrganizations\",\"ResourceIdentifier\":{\"RoleName\":\"AWSControlTowerConfigAggregatorRoleForOrganizations\"}}, {\"ResourceType\":\"AWS::IAM::Role\",\"LogicalResourceId\":\"AWSControlTowerStackSetRole\",\"ResourceIdentifier\":{\"RoleName\":\"AWSControlTowerStackSetRole\"}}]" --parameter ParameterKey=LogArchiveAWSAccountEmail,ParameterValue=${LOG_ARCHIVE_ACCOUNT_MAIL} ParameterKey=AuditAWSAccountEmail,ParameterValue=${AUDIT_ACCOUNT_MAIL} --capabilities "CAPABILITY_NAMED_IAM" --template-url https://${TEMPLATE_BUCKET}.s3.${AWS_REGION}.amazonaws.com/control_tower_template.json

    fi
fi
```

3. After the change set has been created verify it
```shell
aws cloudformation describe-change-set --change-set-name ImportChangeSet --stack-name ${CONTROL_TOWER_STACK}
```

4. Execute the change set to import the resources
```shell
aws cloudformation execute-change-set --change-set-name ImportChangeSet --stack-name ${CONTROL_TOWER_STACK}
```

5. After importing the control tower resources please update the main superwerker stack with the default [update procedure](https://github.com/superwerker/superwerker?tab=readme-ov-file#how-do-i-receive-updates)

#

Lastly, once the update is done you might check for any drifts between the stack and your infrastructure and correct if necessary.
```shell
STACK_DRIFT=$(aws cloudformation detect-stack-drift --stack-name ${CONTROL_TOWER_STACK} --query "StackDriftDetectionId")

aws cloudformation describe-stack-resource-drifts --stack-name ${CONTROL_TOWER_STACK}
```