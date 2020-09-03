import unittest
import boto3
import json

events = boto3.client('events')
guardduty = boto3.client('guardduty')
organizations = boto3.client('organizations')

class MyTestCase(unittest.TestCase):

    @classmethod
    def setUpClass(cls):

        # ensure clean setup
        admin_accounts = guardduty.list_organization_admin_accounts()['AdminAccounts']
        if len(admin_accounts):
            guardduty.disable_organization_admin_account(
                AdminAccountId=admin_accounts[0]['AdminAccountId']
            )

        delegated_administators = organizations.list_delegated_administrators(ServicePrincipal='guardduty.amazonaws.com')['DelegatedAdministrators']
        if len(delegated_administators):
            organizations.deregister_delegated_administrator(
                AccountId=delegated_administators[0]['Id'],
                ServicePrincipal='guardduty.amazonaws.com'
            )

        detectors = guardduty.list_detectors()['DetectorIds']
        if len(detectors):
            guardduty.delete_detector(DetectorId=detectors[0])

    @classmethod
    def triggerGuardDutySetup(cls):
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
                    'Source': 'founopticum.test'
                }
            ]
        )

    def test_guardduty_should_be_set_up_with_clean_state(self):
        self.triggerGuardDutySetup()

    def test_guardduty_setup_should_be_idempotent(self):
        self.fail("shouldn't happen")
