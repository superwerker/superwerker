import os
import unittest
import boto3
import json
import botocore
from retry import retry

events = boto3.client('events')
guardduty = boto3.client('guardduty')
organizations = boto3.client('organizations')
ssm = boto3.client('ssm')
sts = boto3.client('sts')


class MyTestCase(unittest.TestCase):

    master_account_id = sts.get_caller_identity()['Account']

    @classmethod
    def get_audit_account_id(cls):
        return ssm.get_parameter(Name='/superwerker/account_id_audit')['Parameter']['Value']

    @classmethod
    def get_log_archive_account_id(cls):
        return ssm.get_parameter(Name='/superwerker/account_id_logarchive')['Parameter']['Value']

    def get_enrolled_account_id(cls):
        account_factory_account_id = os.environ['ACCOUNT_FACTORY_ACCOUNT_ID']
        return account_factory_account_id

    @classmethod
    def cleanUpGuardDuty(cls):

        try:
            delegated_administators = organizations.list_delegated_administrators(ServicePrincipal='guardduty.amazonaws.com')['DelegatedAdministrators']
        except:
            # this can happen with a fresh account
            return

        if len(delegated_administators) > 0:
            organizations.deregister_delegated_administrator(
                AccountId=delegated_administators[0]['Id'],
                ServicePrincipal='guardduty.amazonaws.com'
            )

        detectors = guardduty.list_detectors()['DetectorIds']
        if len(detectors) > 0:
            cls.delete_guardduty_detector(detectors[0])

        iam = boto3.client('iam')
        try:
            iam.delete_service_linked_role('AWSServiceRoleForAmazonGuardDuty')
        except:
            pass

    @classmethod
    # wait until delegated admin de-registration is completed and detector can be deleted
    @retry(delay=2)
    def delete_guardduty_detector(cls, detector_id):
        guardduty.delete_detector(DetectorId=detector_id)

    # TODO: split up into two tests (probably needs more advanced testing system)
    def test_guardduty_enabled_with_delegated_admin_in_core_and_enrolled_accounts(self):
        # check if audit account has become the master
        audit_account = self.control_tower_exection_role_session(account_id=self.get_audit_account_id())

        guardduty_audit_account = audit_account.client('guardduty')

        detector_id = guardduty_audit_account.list_detectors()['DetectorIds'][0]
        members = guardduty_audit_account.list_members(DetectorId=detector_id, OnlyAssociated='true')['Members']

        actual_members = [a['AccountId'] for a in members if a['RelationshipStatus'] == 'Enabled']

        expected_members = [
            self.get_log_archive_account_id(),
            self.master_account_id,
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
        self.assertEqual('An error occurred (BadRequestException) when calling the DeleteDetector operation: The request is rejected because member cannot disassociate from Organization administrator', str(exception.exception))

        # assert that membership cannot be cancelled
        with self.assertRaises(botocore.exceptions.ClientError) as exception:
            scp_test_session_guardduty.disassociate_from_master_account(DetectorId=detector_id)
        self.assertEqual('An error occurred (BadRequestException) when calling the DisassociateFromMasterAccount operation: The request is rejected because member cannot disassociate from Organization administrator', str(exception.exception))


    @classmethod
    def control_tower_exection_role_session(cls, account_id):
        audit_account_creds = sts.assume_role(
            RoleArn='arn:aws:iam::{}:role/AWSControlTowerExecution'.format(account_id),
            RoleSessionName='superwerkertest'
        )['Credentials']
        audit_account = boto3.session.Session(
            aws_access_key_id=audit_account_creds['AccessKeyId'],
            aws_secret_access_key=audit_account_creds['SecretAccessKey'],
            aws_session_token=audit_account_creds['SessionToken']
        )
        return audit_account

    # TODO: split up into two tests (probably needs more advanced testing system)
    def test_securityhub_enabled_with_delegated_admin_in_core_and_enrolled_accounts(self):
        audit_account = self.control_tower_exection_role_session(self.get_audit_account_id())
        security_hub_audit = audit_account.client('securityhub')
        members_result = security_hub_audit.list_members()['Members']
        actual_members = [member['AccountId'] for member in members_result if member['MemberStatus'] == 'Associated']

        expected_members = [
            self.get_log_archive_account_id(),
            self.get_enrolled_account_id()
        ]

        self.assertCountEqual(expected_members, actual_members)

    def test_security_hub_cannot_be_disabled_in_member_account(self):

        # use log archive as sample member
        log_archive_account = self.control_tower_exection_role_session(self.get_log_archive_account_id())
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
                            "AWS": f'arn:aws:iam::{self.get_log_archive_account_id()}:root'
                        },
                        "Action": "sts:AssumeRole"
                    }
                ]
            }))
        iam.attach_role_policy(
            RoleName='SuperWerkerScpTestRole',
            PolicyArn='arn:aws:iam::aws:policy/AdministratorAccess'
        )


        log_archive_account_sts = log_archive_account.client('sts')
        scp_test_role_creds = log_archive_account_sts.assume_role(
            RoleArn=f'arn:aws:iam::{self.get_log_archive_account_id()}:role/SuperWerkerScpTestRole',
            RoleSessionName='SuperWerkerScpTest'
        )['Credentials']
        scp_test_session = boto3.session.Session(
            aws_access_key_id=scp_test_role_creds['AccessKeyId'],
            aws_secret_access_key=scp_test_role_creds['SecretAccessKey'],
            aws_session_token=scp_test_role_creds['SessionToken']
        )
        scp_test_session_security_hub = scp_test_session.client('securityhub')

        # assert that SCP forbids disabling of security hub
        with self.assertRaises(botocore.exceptions.ClientError) as exception:
            scp_test_session_security_hub.disable_security_hub()

        self.assertEqual(f'An error occurred (AccessDeniedException) when calling the DisableSecurityHub operation: User: arn:aws:sts::{self.get_log_archive_account_id()}:assumed-role/SuperWerkerScpTestRole/SuperWerkerScpTest is not authorized to perform: securityhub:DisableSecurityHub on resource: arn:aws:securityhub:eu-west-1:{self.get_log_archive_account_id()}:hub/default with an explicit deny', str(exception.exception))

        # assert that SCP forbids leaving
        with self.assertRaises(botocore.exceptions.ClientError) as exception:
            scp_test_session_security_hub.disassociate_from_master_account()

        self.assertEqual(f'An error occurred (AccessDeniedException) when calling the DisassociateFromMasterAccount operation: User: arn:aws:sts::{self.get_log_archive_account_id()}:assumed-role/SuperWerkerScpTestRole/SuperWerkerScpTest is not authorized to perform: securityhub:DisassociateFromMasterAccount on resource: arn:aws:securityhub:eu-west-1:{self.get_log_archive_account_id()}:hub/default with an explicit deny', str(exception.exception))

    @classmethod
    def cleanup_security_hub(cls):
        try:
            audit_account_id = cls.get_audit_account_id()
            log_archive_account_id = cls.get_log_archive_account_id()
        except ssm.exceptions.ParameterNotFound:
            return

        try:
            audit_account = cls.control_tower_exection_role_session(audit_account_id)
            security_hub_audit = audit_account.client('securityhub')
            log_archive_account = cls.control_tower_exection_role_session(log_archive_account_id)
            security_hub_log_archive = log_archive_account.client('securityhub')
            members_result = security_hub_audit.list_members()['Members']
            members = [member['AccountId'] for member in members_result]
            if members:
                security_hub_audit.disassociate_members(AccountIds=members)
                security_hub_audit.delete_members(AccountIds=members)
            try:
                security_hub_audit.disable_security_hub()
                security_hub_log_archive.disable_security_hub()
            except:
                pass
        except:
            pass
