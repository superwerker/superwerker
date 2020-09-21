import unittest
import boto3
import json
import botocore
from time import sleep

events = boto3.client('events')
guardduty = boto3.client('guardduty')
organizations = boto3.client('organizations')
ssm = boto3.client('ssm')
sts = boto3.client('sts')


class MyTestCase(unittest.TestCase):

    audit_account_id = ssm.get_parameter(Name='/superwerker/account_id_audit')['Parameter']['Value']
    log_archive_account_id = ssm.get_parameter(Name='/superwerker/account_id_logarchive')['Parameter']['Value']
    master_account_id = sts.get_caller_identity()['Account']

    @classmethod
    def cleanUpGuardDuty(cls):

        delegated_administators = organizations.list_delegated_administrators(ServicePrincipal='guardduty.amazonaws.com')['DelegatedAdministrators']
        if len(delegated_administators) > 0:
            organizations.deregister_delegated_administrator(
                AccountId=delegated_administators[0]['Id'],
                ServicePrincipal='guardduty.amazonaws.com'
            )

        detectors = guardduty.list_detectors()['DetectorIds']
        if len(detectors) > 0:
            guardduty.delete_detector(DetectorId=detectors[0])

    def test_guardduty_should_be_set_up_with_clean_state(self):
        # check if audit account has become the master
        audit_account = self.control_tower_exection_role_session(account_id=self.audit_account_id)

        guardduty_audit_account = audit_account.client('guardduty')

        detector_id = guardduty_audit_account.list_detectors()['DetectorIds'][0]
        members = guardduty_audit_account.list_members(DetectorId=detector_id, OnlyAssociated='true')['Members']

        actual_members = [a['AccountId'] for a in members if a['RelationshipStatus'] == 'Enabled']

        expected_members = [
            self.log_archive_account_id,
            self.master_account_id,
        ]

        self.assertEqual(expected_members, actual_members)

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

    def test_security_hub_is_enabled_in_audit_and_has_members(self):
        audit_account = self.control_tower_exection_role_session(self.audit_account_id)
        security_hub_audit = audit_account.client('securityhub')
        members_result = security_hub_audit.list_members()['Members']
        actual_members = [member['AccountId'] for member in members_result if member['MemberStatus'] == 'Associated']

        expected_members = [
            self.log_archive_account_id,
        ]

        self.assertEqual(expected_members, actual_members)

    def test_security_hub_cannot_be_disabled_in_member_account(self):

        # use log archive as sample member
        log_archive_account = self.control_tower_exection_role_session(self.log_archive_account_id)
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
                            "AWS": f'arn:aws:iam::{self.log_archive_account_id}:root'
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
            RoleArn=f'arn:aws:iam::{self.log_archive_account_id}:role/SuperWerkerScpTestRole',
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

        self.assertEqual(f'An error occurred (AccessDeniedException) when calling the DisableSecurityHub operation: User: arn:aws:sts::{self.log_archive_account_id}:assumed-role/SuperWerkerScpTestRole/SuperWerkerScpTest is not authorized to perform: securityhub:DisableSecurityHub on resource: arn:aws:securityhub:eu-west-1:{self.log_archive_account_id}:hub/default with an explicit deny', str(exception.exception))

        # assert that SCP forbids leaving
        with self.assertRaises(botocore.exceptions.ClientError) as exception:
            scp_test_session_security_hub.disassociate_from_master_account()

        self.assertEqual(f'An error occurred (AccessDeniedException) when calling the DisassociateFromMasterAccount operation: User: arn:aws:sts::{self.log_archive_account_id}:assumed-role/SuperWerkerScpTestRole/SuperWerkerScpTest is not authorized to perform: securityhub:DisassociateFromMasterAccount on resource: arn:aws:securityhub:eu-west-1:{self.log_archive_account_id}:hub/default with an explicit deny', str(exception.exception))

    @classmethod
    def cleanup_security_hub(cls):
        audit_account = cls.control_tower_exection_role_session(cls.audit_account_id)
        security_hub_audit = audit_account.client('securityhub')
        log_archive_account = cls.control_tower_exection_role_session(cls.log_archive_account_id)
        security_hub_log_archive = log_archive_account.client('securityhub')
        members_result = security_hub_audit.list_members()['Members']
        members = [member['AccountId'] for member in members_result]
        security_hub_audit.disassociate_members(AccountIds=members)
        security_hub_audit.delete_members(AccountIds=members)
        try:
            security_hub_audit.disable_security_hub()
            security_hub_log_archive.disable_security_hub()
        except:
            pass
