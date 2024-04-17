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

@pytest.fixture(scope="module")
def control_tower_regions():
    return ssm.get_parameter(Name='/superwerker/controltower/regions')['Parameter']['Value']

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

def test_securityhub_delegated_admin_is_audit_account(audit_account_id):
    
    sechub = boto3.client('securityhub')
    response = sechub.list_organization_admin_accounts()
    admin_account = response["AdminAccounts"][0]["AccountId"]

    assert admin_account == audit_account_id

def test_securityhub_members(audit_account_id):
    
    all_active_accounts = []
    paginator = organizations.get_paginator('list_accounts')
    page_iterator = paginator.paginate()

    for page in page_iterator:        
        for acct in page['Accounts']:
            if acct['Status'] == 'ACTIVE':
                all_active_accounts.append(acct['Id'])
    all_active_accounts.remove(audit_account_id)
    
    audit_account = control_tower_exection_role_session(audit_account_id)
    sechub_audit = audit_account.client('securityhub')
    members_result = sechub_audit.list_members()['Members']
    actual_members = [member['AccountId'] for member in members_result if member['MemberStatus'] == 'Enabled']

    assert set(all_active_accounts) == set(actual_members)

def test_securityhub_finding_aggregator_regions(audit_account_id, control_tower_regions):

    audit_account = control_tower_exection_role_session(audit_account_id)
    sechub_audit = audit_account.client('securityhub')
    finding_aggregators = sechub_audit.list_finding_aggregators()['FindingAggregators']

    control_tower_regions = control_tower_regions.split(",")

    # there must be at least the home region
    assert len(control_tower_regions) > 0

    # if there is only one region, no aggregator is needed
    if len(control_tower_regions) == 1:
        assert finding_aggregators == []

    # if there are multiple regions, there must be one aggregator that links all regions
    if len(control_tower_regions) > 1:
        assert len(finding_aggregators) > 0

        # there is max one aggregator
        finding_aggregator_arn = finding_aggregators[0]['FindingAggregatorArn']
        finding_aggregator = sechub_audit.get_finding_aggregator(FindingAggregatorArn=finding_aggregator_arn)

        # first region in control tower list is home region and should the region of the aggregator
        assert finding_aggregator['FindingAggregationRegion'] == control_tower_regions[0]

        # all other regions should be linked regions
        assert set(finding_aggregator['Regions']) == set(control_tower_regions[1:])

        # we do not use ALL_REGIONS as linkeing mode
        assert finding_aggregator['RegionLinkingMode'] == 'SPECIFIED_REGIONS'

def test_securityhub_enabled_standards(audit_account_id, control_tower_regions):

    audit_account = control_tower_exection_role_session(audit_account_id)
    sechub_audit = audit_account.client('securityhub')
    control_tower_regions = control_tower_regions.split(",")
    region = control_tower_regions[0] # first region is home region

    enabled_standards_response = sechub_audit.get_enabled_standards()['StandardsSubscriptions']
    
    # we are activating exactly one standard
    assert len(enabled_standards_response) == 1

    assert enabled_standards_response[0]['StandardsArn'] == f'arn:aws:securityhub:{region}::standards/aws-foundational-security-best-practices/v/1.0.0'
    assert enabled_standards_response[0]['StandardsSubscriptionArn'] == f'arn:aws:securityhub:{region}:{audit_account_id}:subscription/aws-foundational-security-best-practices/v/1.0.0'
    assert enabled_standards_response[0]['StandardsStatus'] == 'READY'

def test_securityhub_enabled_controls(audit_account_id, control_tower_regions):

    audit_account = control_tower_exection_role_session(audit_account_id)
    sechub_audit = audit_account.client('securityhub')
    control_tower_regions = control_tower_regions.split(",")

    enabled_standards_response = sechub_audit.get_enabled_standards()['StandardsSubscriptions']
    
    # we are activating exactly one standard
    assert len(enabled_standards_response) == 1

    response = sechub_audit.describe_standards_controls(StandardsSubscriptionArn=enabled_standards_response[0]['StandardsSubscriptionArn'])
    standard_controls = response['Controls']
    while "NextToken" in response:
        response = sechub_audit.describe_standards_controls(StandardsSubscriptionArn=enabled_standards_response[0]['StandardsSubscriptionArn'], NextToken=response["NextToken"])
        standard_controls.extend(response["Controls"])

    disabled_controls_for_standard = []
    for control in standard_controls:
        if control['ControlStatus'] == 'DISABLED':
            disabled_controls_for_standard.append(control)

    disabled_control_ids = [control['ControlId'] for control in disabled_controls_for_standard]
    assert 'Macie.1' in disabled_control_ids


# Wait for up to 1 minute, exponentially increasing by 2^x * 1000ms
@retry(wait_exponential_multiplier=1000, wait_exponential_max=10000, stop_max_delay=60000)
def wait_for_role_to_be_assumed(account_id):
    return sts.assume_role(
                RoleArn=f'arn:aws:iam::{account_id}:role/SuperWerkerScpTestRole',
                RoleSessionName='SuperWerkerScpTest'
            )['Credentials']