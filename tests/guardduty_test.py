import boto3
import botocore
import pytest

events = boto3.client('events')
guardduty = boto3.client('guardduty')
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

def test_guardduty_enabled_with_delegated_admin_in_core_and_enrolled_accounts(audit_account_id, log_archive_account_id, management_account_id):
    audit_account = control_tower_exection_role_session(account_id=audit_account_id)
    guardduty_audit_account = audit_account.client('guardduty')

    detector_id = guardduty_audit_account.list_detectors()['DetectorIds'][0]
    members = guardduty_audit_account.list_members(DetectorId=detector_id, OnlyAssociated='true')['Members']

    actual_members = [a['AccountId'] for a in members if a['RelationshipStatus'] == 'Enabled']

    expected_members = [
        log_archive_account_id,
        management_account_id,
    ]

    assert set(expected_members) == set(actual_members)

def test_guardduty_cannot_be_disabled_in_member_account(log_archive_account_id):

    # use log archive as sample member
    log_archive_account = control_tower_exection_role_session(account_id=log_archive_account_id)
    scp_test_session_guardduty = log_archive_account.client('guardduty')
    detector_id = scp_test_session_guardduty.list_detectors()['DetectorIds'][0]

    # assert that guardduty delegated admin forbids deleting the detector
    with pytest.raises(botocore.exceptions.ClientError) as exception:
        scp_test_session_guardduty.delete_detector(DetectorId=detector_id)
    assert 'An error occurred (BadRequestException) when calling the DeleteDetector operation: The request is rejected because an invalid or out-of-range value is specified as an input parameter.' in str(exception.value)

    # assert that membership cannot be cancelled
    with pytest.raises(botocore.exceptions.ClientError) as exception:
        scp_test_session_guardduty.disassociate_from_master_account(DetectorId=detector_id)
    assert 'An error occurred (BadRequestException) when calling the DisassociateFromMasterAccount operation: The request is rejected because an invalid or out-of-range value is specified as an input parameter.' in str(exception.value)


def test_guardduty_s3_protection_enabled_for_org_members(audit_account_id):
    audit_account = control_tower_exection_role_session(account_id=audit_account_id)
    guardduty_audit = audit_account.client('guardduty')
    detector_id = guardduty_audit.list_detectors()['DetectorIds'][0]
    gd_org_config = guardduty_audit.describe_organization_configuration(DetectorId=detector_id)
    assert gd_org_config['AutoEnable'] == True
    assert gd_org_config['DataSources']['S3Logs']['AutoEnable'] == True

def test_guardduty_s3_protection_enabled_for_existing_accounts(log_archive_account_id):
    detector_management = guardduty.get_detector(DetectorId=(
        guardduty.list_detectors()['DetectorIds'][0]))
    assert 'ENABLED' == detector_management['DataSources']['S3Logs']['Status']

    log_archive_account = control_tower_exection_role_session(account_id=log_archive_account_id)
    guardduty_log_archive = log_archive_account.client('guardduty')
    detector_log_archive = guardduty_log_archive.get_detector(DetectorId=(
        guardduty_log_archive.list_detectors()['DetectorIds'][0]))
    assert 'ENABLED' == detector_log_archive['DataSources']['S3Logs']['Status']

