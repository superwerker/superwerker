import os
import unittest
import boto3
import json
import botocore

events = boto3.client('events')
guardduty = boto3.client('guardduty')
organizations = boto3.client('organizations')
ssm = boto3.client('ssm')
sts = boto3.client('sts')


class GuardDutyTest(unittest.TestCase):

    @classmethod
    def get_management_account_id(cls):
        return sts.get_caller_identity()['Account']

    @classmethod
    def get_audit_account_id(cls):
        return ssm.get_parameter(Name='/superwerker/account_id_audit')['Parameter']['Value']

    @classmethod
    def get_log_archive_account_id(cls):
        return ssm.get_parameter(Name='/superwerker/account_id_logarchive')['Parameter']['Value']

    @classmethod
    def get_enrolled_account_id(cls):
        account_factory_account_id = os.environ['ACCOUNT_FACTORY_ACCOUNT_ID']
        return account_factory_account_id

    # TODO: split up into two tests (probably needs more advanced testing system)
    def test_guardduty_enabled_with_delegated_admin_in_core_and_enrolled_accounts(self):
        audit_account = self.control_tower_exection_role_session(account_id=self.get_audit_account_id())

        guardduty_audit_account = audit_account.client('guardduty')

        detector_id = guardduty_audit_account.list_detectors()['DetectorIds'][0]
        members = guardduty_audit_account.list_members(DetectorId=detector_id, OnlyAssociated='true')['Members']

        actual_members = [a['AccountId'] for a in members if a['RelationshipStatus'] == 'Enabled']

        expected_members = [
            self.get_log_archive_account_id(),
            self.get_management_account_id(),
            self.get_enrolled_account_id()
        ]

        self.assertCountEqual(expected_members, actual_members)

    def test_guardduty_cannot_be_disabled_in_member_account(self):

        # use log archive as sample member
        log_archive_account = self.control_tower_exection_role_session(self.get_log_archive_account_id())
        scp_test_session_guardduty = log_archive_account.client('guardduty')
        detector_id = scp_test_session_guardduty.list_detectors()['DetectorIds'][0]

        # assert that guardduty delegated admin forbids deleting the detector
        with self.assertRaises(botocore.exceptions.ClientError) as exception:
            scp_test_session_guardduty.delete_detector(DetectorId=detector_id)
        self.assertEqual('An error occurred (BadRequestException) when calling the DeleteDetector operation: The request is rejected because an invalid or out-of-range value is specified as an input parameter.', str(exception.exception))

        # assert that membership cannot be cancelled
        with self.assertRaises(botocore.exceptions.ClientError) as exception:
            scp_test_session_guardduty.disassociate_from_master_account(DetectorId=detector_id)
        self.assertEqual('An error occurred (BadRequestException) when calling the DisassociateFromMasterAccount operation: The request is rejected because member cannot disassociate from Organization administrator', str(exception.exception))

    def test_guardduty_s3_protection_enabled_for_org_members(self):
        audit_account = self.control_tower_exection_role_session(self.get_audit_account_id())
        guardduty_audit = audit_account.client('guardduty')
        detector_id = guardduty_audit.list_detectors()['DetectorIds'][0]
        gd_org_config = guardduty_audit.describe_organization_configuration(DetectorId=detector_id)
        self.assertTrue(gd_org_config['AutoEnable'])
        self.assertTrue(gd_org_config['DataSources']['S3Logs']['AutoEnable'])

    def test_guardduty_s3_protection_enabled_for_existing_accounts(self):
        detector_management = guardduty.get_detector(DetectorId=(
            guardduty.list_detectors()['DetectorIds'][0]))
        self.assertEqual('ENABLED', detector_management['DataSources']['S3Logs']['Status'])

        log_archive_account = self.control_tower_exection_role_session(self.get_log_archive_account_id())
        guardduty_log_archive = log_archive_account.client('guardduty')
        detector_log_archive = guardduty_log_archive.get_detector(DetectorId=(
            guardduty_log_archive.list_detectors()['DetectorIds'][0]))

        self.assertEqual('ENABLED', detector_log_archive['DataSources']['S3Logs']['Status'])

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

