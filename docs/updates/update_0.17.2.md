# Upgrading existing superwerker installation from 0.17.2

Since Control Tower is managed by Cloudformation starting from version v1.0.0 (also see [ADR](../adrs/control-tower-cloudformation.md)) all existing resources (Organisation, Security Accounts, Roles, etc.) need to be imported. Please follow these instructions prior to updating your superwerker installation <0.17.2.

## Upgrade instructions

**DISCLAIMER**: The ControlTower import mechanism assumes that the AWS Organisation structure is the same after the initial superwerker installation. This means there are two Organisation Units (OUs) called `Security` and `Sandbox`. Inside the `Security` OU there are two Accounts called `Audit` and `Log Archive`. If you renamed any of these resourcers you must update the template manually (shell script and landingzone manifest). The good news: in case something breaks you can just create a new change set and execute it.

1. Go to your superwerker installation and copy the Cloudformation template for the superwerker-ControlTower nested Stack. Either from the console or from the CLI.
1. Create a new file with the template you copied.
1. Add the new ControlTower resources to the template within the `Resources` section of the template. Either synthesize the [control tower stack](../../cdk/src/stacks/control-tower.ts) resources (copy all resources except any custom ones) yourself or copy from [below](#resources-to-import-example)
1. Store the file in an S3 bucket and copy the S3 Object URL (HTTPs one).
1. Run the following shell commands (for example in cloudshell) while replacing `<S3_PATH_TO_TEMPLATE>` pointing to your new template url and `<CONTROLTOWER_NESTED_STACK_NAME>` with the name of your nested Control Tower Stack. 


```shell
UPDATED_CONTROLTOWER_NESTED_STACK_TEMPLATE=<S3_PATH_TO_TEMPLATE>
CONTROLTOWER_NESTED_STACK_NAME=<CONTROLTOWER_NESTED_STACK_NAME>
export ORG_ID=$(aws organizations describe-organization --query "Organization.Id" --output text)
export LZ_ID=$(aws controltower list-landing-zones --query "landingZones[0].arn" --output text)
export LZ_MANIFEST=$(aws controltower get-landing-zone --landing-zone-id ${LZ_ID} --no-cli-pager)
export AUDIT_ACCOUNT_ID=$(echo $LZ_MANIFEST | jq -r '.landingZone.manifest.securityRoles.accountId')
export AUDIT_ACCOUNT_MAIL=$(aws organizations describe-account --account-id $AUDIT_ACCOUNT_ID | jq -r '.Account.Email')
export LOG_ARCHIVE_ACCOUNT_ID=$(echo $LZ_MANIFEST | jq -r '.landingZone.manifest.centralizedLogging.accountId')
export LOG_ARCHIVE_ACCOUNT_MAIL=$(aws organizations describe-account --account-id $LOG_ARCHIVE_ACCOUNT_ID | jq -r '.Account.Email')
export AUDIT_ACCOUNT_SSM_PARAMETER="/superwerker/account_id_audit"
export LOG_ARCHIVE_ACCOUNT_SSM_PARAMETER="/superwerker/account_id_logarchive"

#create change set
aws cloudformation create-change-set --stack-name ${CONTROLTOWER_NESTED_STACK_NAME} --change-set-name ImportChangeSet --change-set-type IMPORT --resources-to-import "[{\"ResourceType\":\"AWS::Organizations::Organization\",\"LogicalResourceId\":\"Organization\",\"ResourceIdentifier\":{\"Id\":\"${ORG_ID}\"}}, {\"ResourceType\":\"AWS::Organizations::Account\",\"LogicalResourceId\":\"AuditAccount\",\"ResourceIdentifier\":{\"AccountId\":\"${AUDIT_ACCOUNT_ID}\"}}, {\"ResourceType\":\"AWS::Organizations::Account\",\"LogicalResourceId\":\"LogArchiveAccount\",\"ResourceIdentifier\":{\"AccountId\":\"${LOG_ARCHIVE_ACCOUNT_ID}\"}}, {\"ResourceType\":\"AWS::ControlTower::LandingZone\",\"LogicalResourceId\":\"LandingZone\",\"ResourceIdentifier\":{\"LandingZoneIdentifier\":\"${LZ_ID}\"}},{\"ResourceType\":\"AWS::SSM::Parameter\",\"LogicalResourceId\":\"AuditAccountParameter\",\"ResourceIdentifier\":{\"Name\":\"${AUDIT_ACCOUNT_SSM_PARAMETER}\"}}, {\"ResourceType\":\"AWS::SSM::Parameter\",\"LogicalResourceId\":\"LogArchiveAccountParameter\",\"ResourceIdentifier\":{\"Name\":\"${LOG_ARCHIVE_ACCOUNT_SSM_PARAMETER}\"}}, {\"ResourceType\":\"AWS::IAM::Role\",\"LogicalResourceId\":\"AWSControlTowerCloudTrailRole\",\"ResourceIdentifier\":{\"RoleName\":\"AWSControlTowerCloudTrailRole\"}}, {\"ResourceType\":\"AWS::IAM::Role\",\"LogicalResourceId\":\"AWSControlTowerAdmin\",\"ResourceIdentifier\":{\"RoleName\":\"AWSControlTowerAdmin\"}}, {\"ResourceType\":\"AWS::IAM::Role\",\"LogicalResourceId\":\"AWSControlTowerConfigAggregatorRoleForOrganizations\",\"ResourceIdentifier\":{\"RoleName\":\"AWSControlTowerConfigAggregatorRoleForOrganizations\"}}, {\"ResourceType\":\"AWS::IAM::Role\",\"LogicalResourceId\":\"AWSControlTowerStackSetRole\",\"ResourceIdentifier\":{\"RoleName\":\"AWSControlTowerStackSetRole\"}}]" --parameter ParameterKey=LogArchiveAWSAccountEmail,ParameterValue=${LOG_ARCHIVE_ACCOUNT_MAIL} ParameterKey=AuditAWSAccountEmail,ParameterValue=${AUDIT_ACCOUNT_MAIL} --capabilities "CAPABILITY_NAMED_IAM" --template-url ${UPDATED_CONTROLTOWER_NESTED_STACK_TEMPLATE}

# verify everything works as it should
aws cloudformation describe-change-set --change-set-name ImportChangeSet --stack-name ${CONTROLTOWER_NESTED_STACK_NAME}

# execute the actual import
aws cloudformation execute-change-set --change-set-name ImportChangeSet --stack-name ${CONTROLTOWER_NESTED_STACK_NAME}

# after importing, check if there any drifts
# don't worry too much as we are updating anyways in the next step
STACK_DRIFT=`aws cloudformation detect-stack-drift --stack-name ${CONTROLTOWER_NESTED_STACK_NAME} --query "StackDriftDetectionId"`

aws cloudformation describe-stack-resource-drifts --stack-name ${CONTROLTOWER_NESTED_STACK_NAME}
```
5. Update the main superwerker Stack to upgrade to your desired version.
6. Check for any drifts in the stack and potentially correct them. The landing zone itself also has a drift detection and you might consider running a "reset" or "repair" operation.

## Resources to import example

<details name="resources">
  <summary>expand example</summary>
  
  These resources need to be added to the existing control tower template and then uploaded to S3. Disclaimer: Control Tower only allows to install the latest version. Consider upgrading to the latest version in the template below.

  ### Resources to add
  ```json
"Organization": {
   "Type": "AWS::Organizations::Organization",
   "Properties": {
    "FeatureSet": "ALL"
   },
   "UpdateReplacePolicy": "Retain",
   "DeletionPolicy": "Retain",
   "Metadata": {
    "aws:cdk:path": "SuperwerkerStack/ControlTower/Organization"
   }
  },
  "LogArchiveAccount": {
   "Type": "AWS::Organizations::Account",
   "Properties": {
    "AccountName": "Log Archive",
    "Email": {
     "Ref": "LogArchiveAWSAccountEmail"
    }
   },
   "DependsOn": [
    "Organization"
   ],
   "UpdateReplacePolicy": "Retain",
   "DeletionPolicy": "Retain",
   "Metadata": {
    "aws:cdk:path": "SuperwerkerStack/ControlTower/LogArchiveAccount"
   }
  },
  "LogArchiveAccountParameter": {
   "Type": "AWS::SSM::Parameter",
   "Properties": {
    "Description": "(superwerker) account id of logarchive account",
    "Name": "/superwerker/account_id_logarchive",
    "Type": "String",
    "Value": {
     "Fn::GetAtt": [
      "LogArchiveAccount",
      "AccountId"
     ]
    }
   },
   "UpdateReplacePolicy": "Delete",
   "DeletionPolicy": "Delete",
   "Metadata": {
    "aws:cdk:path": "SuperwerkerStack/ControlTower/LogArchiveAccountParameter/Resource"
   }
  },
  "AuditAccount": {
   "Type": "AWS::Organizations::Account",
   "Properties": {
    "AccountName": "Audit",
    "Email": {
     "Ref": "AuditAWSAccountEmail"
    }
   },
   "DependsOn": [
    "Organization"
   ],
   "UpdateReplacePolicy": "Retain",
   "DeletionPolicy": "Retain",
   "Metadata": {
    "aws:cdk:path": "SuperwerkerStack/ControlTower/AuditAccount"
   }
  },
  "AuditAccountParameter": {
   "Type": "AWS::SSM::Parameter",
   "Properties": {
    "Description": "(superwerker) account id of audit account",
    "Name": "/superwerker/account_id_audit",
    "Type": "String",
    "Value": {
     "Fn::GetAtt": [
      "AuditAccount",
      "AccountId"
     ]
    }
   },
   "UpdateReplacePolicy": "Delete",
   "DeletionPolicy": "Delete",
   "Metadata": {
    "aws:cdk:path": "SuperwerkerStack/ControlTower/AuditAccountParameter/Resource"
   }
  },
  "AWSControlTowerAdmin": {
   "Type": "AWS::IAM::Role",
   "Properties": {
    "AssumeRolePolicyDocument": {
     "Statement": [
      {
       "Action": "sts:AssumeRole",
       "Effect": "Allow",
       "Principal": {
        "Service": "controltower.amazonaws.com"
       }
      }
     ],
     "Version": "2012-10-17"
    },
    "ManagedPolicyArns": [
     {
      "Fn::Join": [
       "",
       [
        "arn:",
        {
         "Ref": "AWS::Partition"
        },
        ":iam::aws:policy/service-role/AWSControlTowerServiceRolePolicy"
       ]
      ]
     }
    ],
    "Path": "/service-role/",
    "Policies": [
     {
      "PolicyDocument": {
       "Statement": [
        {
         "Action": "ec2:DescribeAvailabilityZones",
         "Effect": "Allow",
         "Resource": "*"
        }
       ],
       "Version": "2012-10-17"
      },
      "PolicyName": "AWSControlTowerAdminPolicy"
     }
    ],
    "RoleName": "AWSControlTowerAdmin"
   },
   "UpdateReplacePolicy": "Delete",
   "DeletionPolicy": "Delete",
   "Metadata": {
    "aws:cdk:path": "SuperwerkerStack/ControlTower/AWSControlTowerAdmin/Resource"
   }
  },
  "AWSControlTowerCloudTrailRole": {
   "Type": "AWS::IAM::Role",
   "Properties": {
    "AssumeRolePolicyDocument": {
     "Statement": [
      {
       "Action": "sts:AssumeRole",
       "Effect": "Allow",
       "Principal": {
        "Service": "cloudtrail.amazonaws.com"
       }
      }
     ],
     "Version": "2012-10-17"
    },
    "Path": "/service-role/",
    "Policies": [
     {
      "PolicyDocument": {
       "Statement": [
        {
         "Action": [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
         ],
         "Effect": "Allow",
         "Resource": "arn:aws:logs:*:*:log-group:aws-controltower/CloudTrailLogs:*"
        }
       ],
       "Version": "2012-10-17"
      },
      "PolicyName": "AWSControlTowerCloudTrailRolePolicy"
     }
    ],
    "RoleName": "AWSControlTowerCloudTrailRole"
   },
   "UpdateReplacePolicy": "Delete",
   "DeletionPolicy": "Delete",
   "Metadata": {
    "aws:cdk:path": "SuperwerkerStack/ControlTower/AWSControlTowerCloudTrailRole/Resource"
   }
  },
  "AWSControlTowerConfigAggregatorRoleForOrganizations": {
   "Type": "AWS::IAM::Role",
   "Properties": {
    "AssumeRolePolicyDocument": {
     "Statement": [
      {
       "Action": "sts:AssumeRole",
       "Effect": "Allow",
       "Principal": {
        "Service": "config.amazonaws.com"
       }
      }
     ],
     "Version": "2012-10-17"
    },
    "ManagedPolicyArns": [
     {
      "Fn::Join": [
       "",
       [
        "arn:",
        {
         "Ref": "AWS::Partition"
        },
        ":iam::aws:policy/service-role/AWSConfigRoleForOrganizations"
       ]
      ]
     }
    ],
    "Path": "/service-role/",
    "RoleName": "AWSControlTowerConfigAggregatorRoleForOrganizations"
   },
   "UpdateReplacePolicy": "Delete",
   "DeletionPolicy": "Delete",
   "Metadata": {
    "aws:cdk:path": "SuperwerkerStack/ControlTower/AWSControlTowerConfigAggregatorRoleForOrganizations/Resource"
   }
  },
  "AWSControlTowerStackSetRole": {
   "Type": "AWS::IAM::Role",
   "Properties": {
    "AssumeRolePolicyDocument": {
     "Statement": [
      {
       "Action": "sts:AssumeRole",
       "Effect": "Allow",
       "Principal": {
        "Service": "cloudformation.amazonaws.com"
       }
      }
     ],
     "Version": "2012-10-17"
    },
    "Path": "/service-role/",
    "Policies": [
     {
      "PolicyDocument": {
       "Statement": [
        {
         "Action": "sts:AssumeRole",
         "Effect": "Allow",
         "Resource": "arn:aws:iam::*:role/AWSControlTowerExecution"
        }
       ],
       "Version": "2012-10-17"
      },
      "PolicyName": "AWSControlTowerStackSetRolePolicy"
     }
    ],
    "RoleName": "AWSControlTowerStackSetRole"
   },
   "UpdateReplacePolicy": "Delete",
   "DeletionPolicy": "Delete",
   "Metadata": {
    "aws:cdk:path": "SuperwerkerStack/ControlTower/AWSControlTowerStackSetRole/Resource"
   }
  },
  "LandingZone": {
   "Type": "AWS::ControlTower::LandingZone",
   "Properties": {
    "Manifest": {
     "governedRegions": [
      {
       "Ref": "AWS::Region"
      }
     ],
     "organizationStructure": {
      "security": {
       "name": "Security"
      },
      "sandbox": {
       "name": "Sandbox"
      }
     },
     "centralizedLogging": {
      "accountId": {
       "Fn::GetAtt": [
        "LogArchiveAccount",
        "AccountId"
       ]
      },
      "configurations": {
       "loggingBucket": {
        "retentionDays": 365
       },
       "accessLoggingBucket": {
        "retentionDays": 365
       }
      },
      "enabled": true
     },
     "securityRoles": {
      "accountId": {
       "Fn::GetAtt": [
        "AuditAccount",
        "AccountId"
       ]
      }
     },
     "accessManagement": {
      "enabled": true
     }
    },
    "Tags": [
     {
      "Key": "name",
      "Value": "superwerker"
     }
    ],
    "Version": "3.3"
   },
   "DependsOn": [
    "AuditAccount",
    "AWSControlTowerAdmin",
    "AWSControlTowerCloudTrailRole",
    "AWSControlTowerConfigAggregatorRoleForOrganizations",
    "AWSControlTowerStackSetRole",
    "LogArchiveAccount",
    "Organization"
   ],
   "UpdateReplacePolicy": "Delete",
   "DeletionPolicy": "Delete",
   "Metadata": {
    "aws:cdk:path": "SuperwerkerStack/ControlTower/LandingZone"
   }
  }
  ```
</details>