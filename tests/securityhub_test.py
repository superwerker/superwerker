import pytest
import boto3
import json
import botocore
from retrying import retry

events = boto3.client('events')
organizations = boto3.client('organizations')
ssm = boto3.client('ssm')
sts = boto3.client('sts')


@pytest.fixture(scope="module")
def management_account_id():
    return sts.get_caller_identity()['Account']

@pytest.fixture(scope="module")
def audit_account_id():
    return ssm.get_parameter(Name='/superwerker/account_id_audit')['Parameter']['Value']

@pytest.fixture(scope="module")
def log_archive_account_id():
    return ssm.get_parameter(Name='/superwerker/account_id_logarchive')['Parameter']['Value']

def control_tower_exection_role_session(account_id):
    account_creds = sts.assume_role(
        RoleArn='arn:aws:iam::{}:role/AWSControlTowerExecution'.format(account_id),
        RoleSessionName='superwerkertest'
    )['Credentials']
    return boto3.session.Session(
        aws_access_key_id=account_creds['AccessKeyId'],
        aws_secret_access_key=account_creds['SecretAccessKey'],
        aws_session_token=account_creds['SessionToken']
    )

# TODO: split up into two tests (probably needs more advanced testing system)
def test_securityhub_enabled_with_delegated_admin_in_core_and_enrolled_accounts(audit_account_id, log_archive_account_id, management_account_id):
    audit_account = control_tower_exection_role_session(audit_account_id)
    security_hub_audit = audit_account.client('securityhub')
    members_result = security_hub_audit.list_members()['Members']
    actual_members = [member['AccountId'] for member in members_result if member['MemberStatus'] == 'Enabled']


    expected_members = [
        log_archive_account_id,
    ]

    assert set(expected_members) == set(actual_members)

def test_security_hub_cannot_be_disabled_in_member_account(log_archive_account_id, management_account_id):

    # use log archive as sample member
    log_archive_account = control_tower_exection_role_session(log_archive_account_id)
    iam = log_archive_account.client('iam')

    # create a temp admin role since the ControlTowerException role is allowed to disable SH
    try:
        try:
            iam.detach_role_policy(
                RoleName='SuperWerkerScpTestRole',
                PolicyArn='arn:aws:iam::aws:policy/AdministratorAccess'
            )
        except:
            pass
        iam.delete_role(RoleName='SuperWerkerScpTestRole')
    except:
        pass

    iam.create_role(
        RoleName='SuperWerkerScpTestRole',
        AssumeRolePolicyDocument=json.dumps({
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Principal": {
                        "AWS": f'arn:aws:iam::{management_account_id}:root'
                    },
                    "Action": "sts:AssumeRole"
                }
            ]
        }))
    iam.attach_role_policy(
        RoleName='SuperWerkerScpTestRole',
        PolicyArn='arn:aws:iam::aws:policy/AdministratorAccess'
    )

    scp_test_role_creds = wait_for_role_to_be_assumed(log_archive_account_id)

    scp_test_session = boto3.session.Session(
        aws_access_key_id=scp_test_role_creds['AccessKeyId'],
        aws_secret_access_key=scp_test_role_creds['SecretAccessKey'],
        aws_session_token=scp_test_role_creds['SessionToken']
    )

    scp_test_session_security_hub = scp_test_session.client('securityhub')

    # assert that SCP forbids disabling of security hub
    with pytest.raises(botocore.exceptions.ClientError) as exception:
        scp_test_session_security_hub.disable_security_hub()
    assert f'An error occurred (AccessDeniedException) when calling the DisableSecurityHub operation: User: arn:aws:sts::{log_archive_account_id}:assumed-role/SuperWerkerScpTestRole/SuperWerkerScpTest is not authorized to perform: securityhub:DisableSecurityHub on resource: arn:aws:securityhub:{scp_test_session.region_name}:{log_archive_account_id}:hub/default with an explicit deny' == str(exception.value)

    # assert that SCP forbids leaving
    with pytest.raises(botocore.exceptions.ClientError) as exception:
        scp_test_session_security_hub.disassociate_from_master_account()
    assert f'An error occurred (AccessDeniedException) when calling the DisassociateFromMasterAccount operation: User: arn:aws:sts::{log_archive_account_id}:assumed-role/SuperWerkerScpTestRole/SuperWerkerScpTest is not authorized to perform: securityhub:DisassociateFromMasterAccount on resource: arn:aws:securityhub:{scp_test_session.region_name}:{log_archive_account_id}:hub/default with an explicit deny' == str(exception.value)

# Wait for up to 1 minute, exponentially increasing by 2^x * 1000ms
@retry(wait_exponential_multiplier=1000, wait_exponential_max=10000, stop_max_delay=60000)
def wait_for_role_to_be_assumed(account_id):
    return sts.assume_role(
                RoleArn=f'arn:aws:iam::{account_id}:role/SuperWerkerScpTestRole',
                RoleSessionName='SuperWerkerScpTest'
            )['Credentials']