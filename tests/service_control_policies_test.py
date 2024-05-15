import boto3


organizations = boto3.client('organizations')


def test_control_tower_service_control_policies():
    service_control_policies = organizations.list_policies(Filter="SERVICE_CONTROL_POLICY")['Policies']
    control_tower_scps = []
    for scp in service_control_policies:
        if scp['Name'].startswith('aws-guardrails-'):
            control_tower_scps.append(scp['Name'])
    assert len(control_tower_scps) > 1, "Expected more than one policy"
    

def test_superwerker_service_control_policies():
    service_control_policies = organizations.list_policies(Filter="SERVICE_CONTROL_POLICY")['Policies']
    for scp in service_control_policies:
        if scp['Name'] == 'superwerker':
            superwerker_policy_id = scp['Id']
            superwerker_policy=organizations.describe_policy(PolicyId=superwerker_policy_id)
            assert superwerker_policy['Policy']['PolicySummary']['Description'] == 'superwerker - SCPBaseline'
            assert ''.join(superwerker_policy['Policy']['Content'].split()) == ''.join('''{
            "Version": "2012-10-17",
            "Statement": [
                {
                "Condition": {
                    "ArnNotLike": {
                    "aws:PrincipalARN": "arn:aws:iam::*:role/stacksets-exec-*"
                    }
                },
                "Action": [
                    'iam:AttachRolePolicy',
                    'iam:CreateRole',
                    'iam:DeleteRole',
                    'iam:DeleteRolePermissionsBoundary',
                    'iam:DeleteRolePolicy',
                    'iam:DetachRolePolicy',
                    'iam:PutRolePermissionsBoundary',
                    'iam:PutRolePolicy',
                    'iam:UpdateAssumeRolePolicy',
                    'iam:UpdateRole',
                    'iam:UpdateRoleDescription',
                ],
                "Resource": [
                    "arn:aws:iam::*:role/service-role/AWSBackupDefaultServiceRole",
                    "arn:aws:iam::*:role/SuperwerkerBackupTagsEnforcementRemediationRole"
                ],
                "Effect": "Deny",
                "Sid": "SWProtectBackup"
                }
            ]
            }'''.split()), 'Policy content does not match expected content'
            
