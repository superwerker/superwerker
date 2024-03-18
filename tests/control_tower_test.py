import boto3
import pytest

control_tower = boto3.client('controltower')
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

@pytest.fixture(scope="module")
def kms_key_arn():
    return ssm.get_parameter(Name='/superwerker/controltower/kms_key')['Parameter']['Value']



def test_control_tower_enabled(audit_account_id, log_archive_account_id, kms_key_arn):

    landing_zones = control_tower.list_landing_zones()

    assert landing_zones['landingZones'], "No landing zone was created"

    landing_zone = control_tower.get_landing_zone(landingZoneIdentifier=landing_zones['landingZones'][0]['arn'])
    assert landing_zone['landingZone']['status'] == 'ACTIVE', "Landing Zone is not active"

    manifest = landing_zone['landingZone']['manifest']

    assert manifest['accessManagement']['enabled'], "Access Management is not enabled"
    assert manifest['securityRoles']['accountId'] == audit_account_id
    assert manifest['governedRegions'] == ['eu-central-1']
    assert manifest['organizationStructure']['sandbox']['name'] == "Sandbox"
    assert manifest['organizationStructure']['security']['name'] == "Security"
    assert manifest['centralizedLogging']['accountId'] == log_archive_account_id
    assert manifest['centralizedLogging']['enabled'], "Centralized Logging is not enabled"
    assert manifest['centralizedLogging']['configurations']['loggingBucket']['retentionDays'] == 90
    assert manifest['centralizedLogging']['configurations']['accessLoggingBucket']['retentionDays'] == 365
    assert manifest['centralizedLogging']['configurations']['kmsKeyArn'] == kms_key_arn


