import boto3
import uuid
import botocore
from retrying import retry
import warnings
import pytest
import json

sts = boto3.client('sts')
ssm = boto3.client('ssm')
organizations = boto3.client('organizations')
config_client = boto3.client('config')

@pytest.fixture(scope="module")
def audit_account_id():
    return ssm.get_parameter(Name='/superwerker/account_id_audit')['Parameter']['Value']

@pytest.fixture(scope="module")
def audit_account_role(audit_account_id):
    account_creds = sts.assume_role(
        RoleArn='arn:aws:iam::{}:role/AWSControlTowerExecution'.format(audit_account_id),
        RoleSessionName='superwerkertest'
    )['Credentials']
    return boto3.session.Session(
        aws_access_key_id=account_creds['AccessKeyId'],
        aws_secret_access_key=account_creds['SecretAccessKey'],
        aws_session_token=account_creds['SessionToken']
    )

@pytest.fixture(scope="module")
def ddb_client_audit(audit_account_role):
    return audit_account_role.client('dynamodb')

@pytest.fixture(scope="module")
def ec2_client_audit(audit_account_role):
    return audit_account_role.client('ec2')

@pytest.fixture(scope="module")
def rds_client_audit(audit_account_role):
    return audit_account_role.client('rds')

@pytest.fixture(scope="module")
def iam_client_audit(audit_account_role):
    return audit_account_role.client('iam')

@pytest.fixture(scope="module")
def config_client_audit(audit_account_role):
    return audit_account_role.client('config')

@pytest.fixture
def create_random_table(ddb_client_audit):
    table_name = uuid.uuid4().hex
    ddb_client_audit.create_table(
        TableName=table_name,
        KeySchema=[
            {
                'AttributeName': 'some_key',
                'KeyType': 'HASH'
            },
        ],
        AttributeDefinitions=[
            {
                'AttributeName': 'some_key',
                'AttributeType': 'S'
            },

        ],
        BillingMode='PAY_PER_REQUEST',
    )
    table = wait_for_table_available(ddb_client_audit, table_name)
    return table

@pytest.fixture
def random_ebs_volume_id(ec2_client_audit):
    result = ec2_client_audit.create_volume(
        AvailabilityZone=ec2_client_audit.describe_availability_zones()['AvailabilityZones'][0]['ZoneName'],
        Size=1
    )
    return result['VolumeId']

@pytest.fixture
def random_rds_instance_identifier(rds_client_audit):
    db_instance_identifier = 'db-{}'.format(uuid.uuid4().hex)

    rds_client_audit.create_db_instance(
        DBInstanceIdentifier=db_instance_identifier,
        DBInstanceClass='db.t4g.micro',
        Engine='mysql',
        MasterUsername='anonym',
        MasterUserPassword=db_instance_identifier,
        AllocatedStorage=20,
    )
    return db_instance_identifier

@pytest.fixture
def ddb_table(ddb_client_audit, create_random_table):
    yield create_random_table
    delete_ddb_table(ddb_client_audit, create_random_table)
    
@retry(stop_max_delay=1800000, wait_fixed=20000)
def delete_ddb_table(ddb_client_audit, table):
    ddb_client_audit.delete_table(TableName=table['TableName'])

@pytest.fixture
def ebs_volume_id(ec2_client_audit, random_ebs_volume_id):
    yield random_ebs_volume_id
    ec2_client_audit.delete_volume(VolumeId=random_ebs_volume_id)

@pytest.fixture
def rds_instance(rds_client_audit, random_rds_instance_identifier):
    yield random_rds_instance_identifier
    rds_client_audit.delete_db_instance(DBInstanceIdentifier=random_rds_instance_identifier, SkipFinalSnapshot=True)

# https://github.com/boto/boto3/issues/454
@pytest.fixture(autouse=True)
def default_vpc(ec2_client_audit):
    warnings.filterwarnings("ignore", category=ResourceWarning, message="unclosed.*<ssl.SSLSocket.*>")

    try:
        ec2_client_audit.create_default_vpc()
    except:
        # presumably already exists
        pass

def test_cannot_delete_backup_service_role(iam_client_audit, audit_account_id):
    with pytest.raises(botocore.exceptions.ClientError) as exception:
        iam_client_audit.delete_role(RoleName='AWSBackupDefaultServiceRole')
    assert f'An error occurred (AccessDenied) when calling the DeleteRole operation: User: arn:aws:sts::{audit_account_id}:assumed-role/AWSControlTowerExecution/superwerkertest is not authorized to perform: iam:DeleteRole on resource: role AWSBackupDefaultServiceRole with an explicit deny in a service control policy' in str(exception.value)

def test_cannot_delete_backup_remediation_role(iam_client_audit, audit_account_id):
    with pytest.raises(botocore.exceptions.ClientError) as exception:
        iam_client_audit.delete_role(RoleName='SuperwerkerBackupTagsEnforcementRemediationRole')
    assert f'An error occurred (AccessDenied) when calling the DeleteRole operation: User: arn:aws:sts::{audit_account_id}:assumed-role/AWSControlTowerExecution/superwerkertest is not authorized to perform: iam:DeleteRole on resource: role SuperwerkerBackupTagsEnforcementRemediationRole with an explicit deny in a service control policy' in str(exception.value)

def test_check_conformance_pack_status(config_client_audit):
    conformance_packs = config_client_audit.describe_conformance_pack_status()
    assert len(conformance_packs['ConformancePackStatusDetails']) == 1, 'Expected exactly one conformance pack in audit account'
    assert 'OrgConformsPack-superwerker-backup-enforce' in conformance_packs['ConformancePackStatusDetails'][0]['ConformancePackName'], 'Conformance Pack name does not match expected prefix in audit account'
    assert conformance_packs['ConformancePackStatusDetails'][0]['ConformancePackState'] == 'CREATE_COMPLETE', 'Conformance Pack is not created successfully in audit account'

    org_conformance_packs = config_client.describe_organization_conformance_packs()
    assert org_conformance_packs['OrganizationConformancePacks'][0]['OrganizationConformancePackName'] == 'superwerker-backup-enforce', 'Organization Conformance Pack name does not match expected name'

    org_conformance_pack_statuses = config_client.describe_organization_conformance_pack_statuses()
    assert org_conformance_pack_statuses['OrganizationConformancePackStatuses'][0]['Status'] in ['CREATE_SUCCESSFUL' , 'UPDATE_SUCCESSFUL'], 'Conformance Pack is not created successfully'
    

def test_check_tag_policy():
    root_id = organizations.list_roots()['Roots'][0]['Id']
    tag_policies = organizations.list_policies_for_target(TargetId=root_id,Filter="TAG_POLICY")['Policies']
    assert len(tag_policies) == 1, "Expected exactly one tag policy"
    tag_policy_id = tag_policies[0]['Id']
    tag_policy=organizations.describe_policy(PolicyId=tag_policy_id)
    assert tag_policy['Policy']['PolicySummary']['Description'] == 'superwerker - TagPolicy'
    assert json.loads(tag_policy['Policy']['Content']) == json.loads('''{
    "tags": {
        "superwerker:backup": {
        "tag_value": {
            "@@assign": [
            "none",
            "daily"
            ]
        },
        "enforced_for": {
            "@@assign": [
            "dynamodb:table",
            "ec2:volume"
            ]
        }
        }
    }
    }'''), 'Policy content does not match expected content'

def test_check_backup_policy():
    root_id = organizations.list_roots()['Roots'][0]['Id']
    backup_policies = organizations.list_policies_for_target(TargetId=root_id,Filter="BACKUP_POLICY")['Policies']
    assert len(backup_policies) == 1, "Expected exactly one backup policy"
    backup_policy_id = backup_policies[0]['Id']
    backup_policy=organizations.describe_policy(PolicyId=backup_policy_id)
    assert backup_policy['Policy']['PolicySummary']['Description'] == 'superwerker - BackupPolicy'
    assert json.loads(backup_policy['Policy']['Content']) == json.loads('''{
    "plans": {
        "superwerker-backup": {
            "regions":{
                "@@assign":
                [
                    "eu-central-1"
                ]
            },
            "rules": {
                "backup-daily": {
                    "lifecycle": {
                        "delete_after_days": {
                            "@@assign": 30
                        }
                    },
                    "schedule_expression": {
                        "@@assign": "cron(0 5 ? * * *)"
                    },
                    "target_backup_vault_name": {
                        "@@assign": "Default"
                    }
                }
            },
            "selections": {
                "tags": {
                    "backup-daily": {
                        "iam_role_arn": {
                            "@@assign": "arn:aws:iam::$account:role/service-role/AWSBackupDefaultServiceRole"
                        },
                        "tag_key": {
                            "@@assign": "superwerker:backup"
                        },
                        "tag_value": {
                            "@@assign":
                            [
                                "daily"
                            ]
                        }
                    }
                }
            }
        }
    }
}'''), 'Policy content does not match expected content'

# sometimes it can take some time before the attached tap policy takes effect, therefore we retry this test
@pytest.mark.flaky(retries=3, delay=1)
def test_cannot_change_ebs_backup_tags(ec2_client_audit, ebs_volume_id):
    with pytest.raises(botocore.exceptions.ClientError) as exception:
        wait_for_create_tags(ec2_client_audit, ebs_volume_id, [{'Key': 'superwerker:backup', 'Value': 'iamnotvalid'}])
    assert 'An error occurred (TagPolicyViolation) when calling the CreateTags operation: The tag policy does not allow the specified value for the following tag key: \'superwerker:backup\'.' in str(exception.value)

def test_can_change_ebs_backup_tags_to_none(ec2_client_audit, ebs_volume_id):
    wait_for_create_tags(ec2_client_audit, ebs_volume_id, [{'Key': 'superwerker:backup', 'Value': 'none'}])

# sometimes it can take some time before the attached tap policy takes effect, therefore we retry this test
@pytest.mark.flaky(retries=3, delay=1)
def test_cannot_change_dynamodb_backup_tags(ddb_client_audit, ddb_table):
    with pytest.raises(botocore.exceptions.ClientError) as exception:
        ddb_client_audit.tag_resource(
            ResourceArn=ddb_table['TableArn'],
            Tags=[{'Key': 'superwerker:backup', 'Value': 'iamnotvalid'}]
        )
    assert 'An error occurred (ValidationException) when calling the TagResource operation: One or more parameter values were invalid: The tag policy does not allow the specified value for the following tag key: \'superwerker:backup\'.' in str(exception.value)

@pytest.mark.skip(reason="flaky test")
def test_can_change_dynamodb_backup_tags_to_none(ddb_client_audit, ddb_table):
    ddb_client_audit.tag_resource(
        ResourceArn=ddb_table['TableArn'],
        Tags=[{'Key': 'superwerker:backup', 'Value': 'none'}]
    )

@pytest.mark.skip(reason="this will take a long time to run")
def test_untagged_dynamodb_gets_tagged_for_aws_backup_by_default(ddb_client_audit, ddb_table):
    actual_tags = wait_for_table_tags_to_appear(ddb_client_audit, ddb_table)
    expected_tags = [{'Key': 'superwerker:backup', 'Value': 'daily'}]
    assert expected_tags == actual_tags

@pytest.mark.skip(reason="this will take a long time to run")
def test_untagged_ebs_gets_tagged_for_aws_backup_by_default(ec2_client_audit, ebs_volume_id):
    actual_tags = wait_for_ebs_tags_to_appear(ec2_client_audit, ebs_volume_id)
    expected_tags = [{'Key': 'superwerker:backup', 'Value': 'daily'}]
    assert expected_tags == actual_tags

@pytest.mark.skip(reason="this will take a long time to run")
def test_untagged_rds_instance_gets_tagged_for_aws_backup_by_default(rds_client_audit, rds_instance):
    actual_tags = wait_for_rds_instance_tags_to_appear(rds_client_audit, rds_instance)
    expected_tags = [{'Key': 'superwerker:backup', 'Value': 'daily'}]
    assert expected_tags == actual_tags


@retry(stop_max_delay=1800000, wait_fixed=20000)
def wait_for_table_tags_to_appear(ddb, table):
    actual_tags = ddb.list_tags_of_resource(ResourceArn=table['TableArn'])['Tags']
    if len(actual_tags) == 0:
        raise

    return actual_tags

@retry(wait_exponential_multiplier=1000, wait_exponential_max=10000, stop_max_delay=60000)
def wait_for_create_tags(ec2, volume_id, tags):
        ec2.create_tags(
            Resources=[volume_id],
            Tags=tags
        )

@retry(stop_max_delay=1800000, wait_fixed=20000)
def wait_for_ebs_tags_to_appear(ec2, volume_id):
    actual_tags = ec2.describe_volumes(VolumeIds=[volume_id])['Volumes'][0]['Tags']

    if len(actual_tags) == 0:
            raise

    return actual_tags

@retry(stop_max_delay=1800000, wait_fixed=20000)
def wait_for_rds_instance_tags_to_appear(rds, rds_instance_id):
    actual_tags = rds.describe_db_instances(DBInstanceIdentifier=rds_instance_id)['DBInstances'][0]['TagList']

    if len(actual_tags) == 0:
        raise

    return actual_tags

@retry(stop_max_delay=180000, wait_fixed=1000)
def wait_for_table_available(ddb, table_name):
    table = ddb.describe_table(TableName=table_name)['Table']
    if table['TableStatus'] != 'ACTIVE':
        raise 'table not ready yet'
    return table