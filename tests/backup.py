import os
import unittest
import boto3
import uuid
import time
import botocore
from retrying import retry

sts = boto3.client('sts')


class BackupTestCase(unittest.TestCase):

    maxDiff = None

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

    @retry(stop_max_delay=300000, wait_fixed=20000)
    def wait_for_table_tags_to_appear(self, ddb, table):
        actual_tags = ddb.list_tags_of_resource(ResourceArn=table['TableArn'])['Tags']
        if len(actual_tags) == 0:
            raise

        return actual_tags

    def test_cannot_change_dynamodb_backup_tags(self):
        enrolled_account = self.control_tower_exection_role_session(self.get_enrolled_account_id())
        ddb = enrolled_account.client('dynamodb')
        table = self.create_random_table(ddb)
        time.sleep(10)
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
        time.sleep(10)
        ddb.tag_resource(
            ResourceArn=table['TableArn'],
            Tags=[{'Key': 'superwerker:backup', 'Value': 'none'}]
        )

    def test_cannot_delete_backup_service_role(self):
        enrolled_account = self.control_tower_exection_role_session(self.get_enrolled_account_id())
        iam = enrolled_account.client('iam')
        with self.assertRaises(botocore.exceptions.ClientError) as exception:
            iam.delete_role(RoleName='AWSBackupDefaultServiceRole')

        self.assertEqual(f'An error occurred (AccessDenied) when calling the DeleteRole operation: User: arn:aws:sts::{self.get_enrolled_account_id()}:assumed-role/AWSControlTowerExecution/superwerkertest is not authorized to perform: iam:DeleteRole on resource: role AWSBackupDefaultServiceRole with an explicit deny', str(exception.exception))

    def test_cannot_delete_backup_remediation_role(self):
        enrolled_account = self.control_tower_exection_role_session(self.get_enrolled_account_id())
        iam = enrolled_account.client('iam')
        with self.assertRaises(botocore.exceptions.ClientError) as exception:
            iam.delete_role(RoleName='SuperwerkerBackupTagsEnforcementRemediationRole')

        self.assertEqual(f'An error occurred (AccessDenied) when calling the DeleteRole operation: User: arn:aws:sts::{self.get_enrolled_account_id()}:assumed-role/AWSControlTowerExecution/superwerkertest is not authorized to perform: iam:DeleteRole on resource: role SuperwerkerBackupTagsEnforcementRemediationRole with an explicit deny', str(exception.exception))

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
        table = ddb.describe_table(TableName=table_name)['Table']
        return table
