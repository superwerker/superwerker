import os
import unittest
import boto3
import uuid
import botocore
from retrying import retry
import warnings

sts = boto3.client('sts')


class BackupTest(unittest.TestCase):

    maxDiff = None

    # https://github.com/boto/boto3/issues/454
    def setUp(self):
        warnings.filterwarnings("ignore", category=ResourceWarning, message="unclosed.*<ssl.SSLSocket.*>")

        enrolled_account = self.control_tower_exection_role_session(self.get_enrolled_account_id())
        ec2 = enrolled_account.client('ec2')
        try:
            ec2.create_default_vpc()
        except:
            # presumably already exists
            pass

    def get_enrolled_account_id(cls):
        account_factory_account_id = os.environ['ACCOUNT_FACTORY_ACCOUNT_ID']
        return account_factory_account_id

    @classmethod
    def control_tower_exection_role_session(cls, account_id):
        account_creds = sts.assume_role(
            RoleArn='arn:aws:iam::{}:role/AWSControlTowerExecution'.format(account_id),
            RoleSessionName='superwerkertest'
        )['Credentials']
        return boto3.session.Session(
            aws_access_key_id=account_creds['AccessKeyId'],
            aws_secret_access_key=account_creds['SecretAccessKey'],
            aws_session_token=account_creds['SessionToken']
        )

    def test_untagged_dynamodb_gets_tagged_for_aws_backup_by_default(self):
        enrolled_account = self.control_tower_exection_role_session(self.get_enrolled_account_id())

        ddb = enrolled_account.client('dynamodb')

        table = self.create_random_table(ddb)

        actual_tags = self.wait_for_table_tags_to_appear(ddb, table)
        expected_tags = [{'Key': 'superwerker:backup', 'Value': 'daily'}]

        self.assertCountEqual(expected_tags, actual_tags)

    @retry(stop_max_delay=1800000, wait_fixed=20000)
    def wait_for_table_tags_to_appear(self, ddb, table):
        actual_tags = ddb.list_tags_of_resource(ResourceArn=table['TableArn'])['Tags']
        if len(actual_tags) == 0:
            raise

        return actual_tags

    def test_cannot_change_dynamodb_backup_tags(self):
        enrolled_account = self.control_tower_exection_role_session(self.get_enrolled_account_id())
        ddb = enrolled_account.client('dynamodb')
        table = self.create_random_table(ddb)
        with self.assertRaises(botocore.exceptions.ClientError) as exception:
            ddb.tag_resource(
                ResourceArn=table['TableArn'],
                Tags=[{'Key': 'superwerker:backup', 'Value': 'iamnotvalid'}]
            )
        self.assertEqual('An error occurred (ValidationException) when calling the TagResource operation: One or more parameter values were invalid: The tag policy does not allow the specified value for the following tag key: \'superwerker:backup\'.', str(exception.exception))

    def test_can_change_dynamodb_backup_tags_to_none(self):
        enrolled_account = self.control_tower_exection_role_session(self.get_enrolled_account_id())
        ddb = enrolled_account.client('dynamodb')
        table = self.create_random_table(ddb)
        ddb.tag_resource(
            ResourceArn=table['TableArn'],
            Tags=[{'Key': 'superwerker:backup', 'Value': 'none'}]
        )

    def test_untagged_ebs_gets_tagged_for_aws_backup_by_default(self):
        enrolled_account = self.control_tower_exection_role_session(self.get_enrolled_account_id())

        ec2 = enrolled_account.client('ec2')

        volume_id = self.create_random_ebs(ec2)

        actual_tags = self.wait_for_ebs_tags_to_appear(ec2, volume_id)
        expected_tags = [{'Key': 'superwerker:backup', 'Value': 'daily'}]

        self.assertCountEqual(expected_tags, actual_tags)

    def test_cannot_change_ebs_backup_tags(self):
        enrolled_account = self.control_tower_exection_role_session(self.get_enrolled_account_id())
        ec2 = enrolled_account.client('ec2')
        volume_id = self.create_random_ebs(ec2)

        with self.assertRaises(botocore.exceptions.ClientError) as exception:
            self.wait_for_create_tags(ec2, volume_id, [{'Key': 'superwerker:backup', 'Value': 'iamnotvalid'}])
        self.assertEqual('An error occurred (TagPolicyViolation) when calling the CreateTags operation: The tag policy does not allow the specified value for the following tag key: \'superwerker:backup\'.', str(exception.exception))

    def test_can_change_ebs_backup_tags_to_none(self):
        enrolled_account = self.control_tower_exection_role_session(self.get_enrolled_account_id())
        ec2 = enrolled_account.client('ec2')
        volume_id = self.create_random_ebs(ec2)
        self.wait_for_create_tags(ec2, volume_id, [{'Key': 'superwerker:backup', 'Value': 'none'}])

    @retry(wait_exponential_multiplier=1000, wait_exponential_max=10000, stop_max_delay=60000)
    def wait_for_create_tags(self, ec2, volume_id, tags):
           ec2.create_tags(
                Resources=[volume_id],
                Tags=tags
            )

    @retry(stop_max_delay=1800000, wait_fixed=20000)
    def wait_for_ebs_tags_to_appear(self, ec2, volume_id):
        actual_tags = ec2.describe_volumes(VolumeIds=[volume_id])['Volumes'][0]['Tags']

        if len(actual_tags) == 0:
                raise

        return actual_tags

    def test_untagged_rds_instance_gets_tagged_for_aws_backup_by_default(self):
        enrolled_account = self.control_tower_exection_role_session(self.get_enrolled_account_id())

        rds = enrolled_account.client('rds')

        rds_instance_id = self.create_random_rds_instance(rds)

        actual_tags = self.wait_for_rds_instance_tags_to_appear(rds, rds_instance_id)
        expected_tags = [{'Key': 'superwerker:backup', 'Value': 'daily'}]
        self.assertCountEqual(expected_tags, actual_tags)

    @retry(stop_max_delay=1800000, wait_fixed=20000)
    def wait_for_rds_instance_tags_to_appear(self, rds, rds_instance_id):
        actual_tags = rds.describe_db_instances(DBInstanceIdentifier=rds_instance_id)['DBInstances'][0]['TagList']

        if len(actual_tags) == 0:
            raise

        return actual_tags

    def test_cannot_delete_backup_service_role(self):
        enrolled_account = self.control_tower_exection_role_session(self.get_enrolled_account_id())
        iam = enrolled_account.client('iam')
        with self.assertRaises(botocore.exceptions.ClientError) as exception:
            iam.delete_role(RoleName='AWSBackupDefaultServiceRole')

        self.assertEqual(f'An error occurred (AccessDenied) when calling the DeleteRole operation: User: arn:aws:sts::{self.get_enrolled_account_id()}:assumed-role/AWSControlTowerExecution/superwerkertest is not authorized to perform: iam:DeleteRole on resource: role AWSBackupDefaultServiceRole with an explicit deny in a service control policy', str(exception.exception))

    def test_cannot_delete_backup_remediation_role(self):
        enrolled_account = self.control_tower_exection_role_session(self.get_enrolled_account_id())
        iam = enrolled_account.client('iam')
        with self.assertRaises(botocore.exceptions.ClientError) as exception:
            iam.delete_role(RoleName='SuperwerkerBackupTagsEnforcementRemediationRole')

        self.assertEqual(f'An error occurred (AccessDenied) when calling the DeleteRole operation: User: arn:aws:sts::{self.get_enrolled_account_id()}:assumed-role/AWSControlTowerExecution/superwerkertest is not authorized to perform: iam:DeleteRole on resource: role SuperwerkerBackupTagsEnforcementRemediationRole with an explicit deny in a service control policy', str(exception.exception))

    @staticmethod
    def create_random_table(ddb):
        table_name = uuid.uuid4().hex
        ddb.create_table(
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
        table = BackupTest.wait_for_table_available(ddb, table_name)
        return table

    @staticmethod
    @retry(stop_max_delay=180000, wait_fixed=1000)
    def wait_for_table_available(ddb, table_name):
        table = ddb.describe_table(TableName=table_name)['Table']
        if table['TableStatus'] != 'ACTIVE':
            raise 'table not ready yet'
        return table

    @staticmethod
    def create_random_ebs(ec2):
        result = ec2.create_volume(
            AvailabilityZone=ec2.describe_availability_zones()['AvailabilityZones'][0]['ZoneName'],
            Size=1
        )
        return result['VolumeId']

    @staticmethod
    def create_random_rds_instance(rds):
        db_instance_identifier = 'db-{}'.format(uuid.uuid4().hex)

        rds.create_db_instance(
            DBInstanceIdentifier=db_instance_identifier,
            DBInstanceClass='db.t2.micro',
            Engine='mysql',
            MasterUsername='arnonym',
            MasterUserPassword=db_instance_identifier,
            AllocatedStorage=20,
        )
        return db_instance_identifier
