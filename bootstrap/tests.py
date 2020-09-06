import unittest
import boto3
import json
from time import sleep

events = boto3.client('events')
guardduty = boto3.client('guardduty')
organizations = boto3.client('organizations')
ssm = boto3.client('ssm')
sts = boto3.client('sts')


class MyTestCase(unittest.TestCase):

    audit_account_id = ssm.get_parameter(Name='/founopticum/account_id_audit')['Parameter']['Value']
    log_archive_account_id = ssm.get_parameter(Name='/founopticum/account_id_logarchive')['Parameter']['Value']
    master_account_id = sts.get_caller_identity()['Account']

    @classmethod
    def cleanUpGuardDuty(cls):

        # ensure clean setup
        while True:
            admin_accounts = guardduty.list_organization_admin_accounts()['AdminAccounts']
            if len(admin_accounts) == 0:
                break

            guardduty.disable_organization_admin_account(
                AdminAccountId=admin_accounts[0]['AdminAccountId']
            )

            sleep(1)

        delegated_administators = organizations.list_delegated_administrators(ServicePrincipal='guardduty.amazonaws.com')['DelegatedAdministrators']
        if len(delegated_administators) > 0:
            organizations.deregister_delegated_administrator(
                AccountId=delegated_administators[0]['Id'],
                ServicePrincipal='guardduty.amazonaws.com'
            )

        detectors = guardduty.list_detectors()['DetectorIds']
        if len(detectors) > 0:
            guardduty.delete_detector(DetectorId=detectors[0])

    @classmethod
    def triggerSetupLandingZoneCWEvent(cls, trigger_name):
        # trigger SSM automation
        events.put_events(
            Entries=[
                {
                    'Detail': json.dumps(
                        {
                            'serviceEventDetails': {
                                'setupLandingZoneStatus': {
                                    'state': 'SUCCEEDED'
                                }
                            },
                            'eventName': 'SetupLandingZone',
                        }
                    ),
                    'DetailType': 'AWS Service Event via CloudTrail',
                    'Source': trigger_name
                }
            ]
        )

        sleep(5) # give it some time to trigger the event

    @classmethod
    def waitForSSMExecutionsToHaveFinished(cls, document_name_prefix):
        while True:
            running_executions = ssm.describe_automation_executions(
                Filters=[
                    {
                        'Key': 'DocumentNamePrefix',
                        'Values': [
                            document_name_prefix,
                        ]
                    },
                    {
                        'Key': 'ExecutionStatus',
                        'Values': [
                            'InProgress',
                        ]
                    },
                ],
            )['AutomationExecutionMetadataList']

            if len(running_executions) == 0:
                break

            sleep(2)

    @unittest.skip("wait until gd api works again")
    def test_guardduty_should_be_set_up_with_clean_state(self):
        self.cleanUpGuardDuty()
        self.triggerSetupLandingZoneCWEvent('founopticum.test')
        self.waitForSSMExecutionsToHaveFinished('founopticum-GuardDuty')

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

    def control_tower_exection_role_session(self, account_id):
        audit_account_creds = sts.assume_role(
            RoleArn='arn:aws:iam::{}:role/AWSControlTowerExecution'.format(account_id),
            RoleSessionName='founopticumtest'
        )['Credentials']
        audit_account = boto3.session.Session(
            aws_access_key_id=audit_account_creds['AccessKeyId'],
            aws_secret_access_key=audit_account_creds['SecretAccessKey'],
            aws_session_token=audit_account_creds['SessionToken']
        )
        return audit_account

    # def test_guardduty_setup_should_be_idempotent(self):
    #     pass

    def test_security_hub_is_enabled_in_audit_and_has_members(self):
        audit_account = self.control_tower_exection_role_session(self.audit_account_id)
        security_hub_audit = audit_account.client('securityhub')
        log_archive_account = self.control_tower_exection_role_session(self.log_archive_account_id)
        security_hub_log_archive = log_archive_account.client('securityhub')

        self.cleanUpSecurityHub(security_hub_audit, security_hub_log_archive)
        self.triggerSetupLandingZoneCWEvent('founopticum.security-hub-test')
        self.waitForSSMExecutionsToHaveFinished('founopticum-SecurityHub')

        members_result = security_hub_audit.list_members()['Members']
        actual_members = [member['AccountId'] for member in members_result if member['MemberStatus'] == 'Associated']

        expected_members = [
            self.log_archive_account_id,
        ]

        self.assertEqual(expected_members, actual_members)

    def cleanUpSecurityHub(self, security_hub_audit, security_hub_log_archive):
        members_result = security_hub_audit.list_members()['Members']
        members = [member['AccountId'] for member in members_result]
        security_hub_audit.disassociate_members(AccountIds=members)
        security_hub_audit.delete_members(AccountIds=members)
        try:
            security_hub_audit.disable_security_hub()
            security_hub_log_archive.disable_security_hub()
        except:
            pass
