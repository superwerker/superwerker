import os
import unittest
import boto3
import uuid
import time
from retrying import retry
import warnings

ses = boto3.client('ses', region_name='eu-west-1')
ssm = boto3.client('ssm')

class RootMailTestCase(unittest.TestCase):

    # https://github.com/boto/boto3/issues/454
    def setUp(self):
        warnings.filterwarnings("ignore", category=ResourceWarning, message="unclosed.*<ssl.SSLSocket.*>")

    @classmethod
    def send_email(cls, id, body_text=None, body_html=None, subject=None):

        res = ses.list_identities(
            IdentityType='Domain',
            MaxItems=1,
        )

        domain = res['Identities'][0]

        body = {}

        if body_text:
            body['Text'] = { 'Data': body_text }
        if body_html:
            body['Html'] = { 'Data': body_html }

        if subject is None:
            subject = id

        res = ses.send_email(
            Source="test@{domain}".format(domain=domain),
            Destination={
                'ToAddresses': [
                    "root+{id}@{domain}".format(domain=domain, id=id),
                ],
            },
            Message={
                'Subject': {
                    'Data': subject,
                },
                'Body': body,
            },
        )

        return res

    @classmethod
    @retry(stop_max_delay=100000, wait_fixed=5000)
    def get_ops_item_by_title(cls, title):
        res = ssm.get_ops_summary(
            Filters=[
                {
                    'Key': 'AWS:OpsItem.Title',
                    'Values': [
                        title,
                    ],
                    'Type': 'Equal',
                },
                {
                    'Key': 'AWS:OpsItem.Status',
                    'Values': [
                        'Open',
                    ],
                    'Type': 'Equal',
                },
            ],
        )

        if len(res['Entities']) == 0:
            raise  # mail has probably not arrived yet
        return res

    def test_root_email_body_text(self):

        id = uuid.uuid4().hex
        self.send_email(id, 'This is a mail body')

        time.sleep(10)

        res = self.get_ops_item_by_title(id)

        self.assertEqual(1, len(res['Entities']))

        id = res['Entities'][0]['Id']
        description = res['Entities'][0]['Data']['AWS:OpsItem']['Content'][0]['Description']

        self.assertEqual('This is a mail body', description.rstrip())

        ssm.update_ops_item(
            OpsItemId=id,
            Status='Resolved',
        )

    def test_root_email_body_text_and_html(self):

        id = uuid.uuid4().hex
        self.send_email(id, 'This is another mail body', "<h1>This should be ignored</h1>")

        res = self.get_ops_item_by_title(id)

        self.assertEqual(1, len(res['Entities']))

        id = res['Entities'][0]['Id']
        description = res['Entities'][0]['Data']['AWS:OpsItem']['Content'][0]['Description']

        self.assertEqual('This is another mail body', description.rstrip())

        ssm.update_ops_item(
            OpsItemId=id,
            Status='Resolved',
        )

    def test_root_email_body_html(self):

        id = uuid.uuid4().hex
        self.send_email(id, None, "<script>alert('Hi!')</script><h1>Hello</h1>")

        res = self.get_ops_item_by_title(id)

        self.assertEqual(1, len(res['Entities']))

        id = res['Entities'][0]['Id']
        description = res['Entities'][0]['Data']['AWS:OpsItem']['Content'][0]['Description']

        self.assertEqual("<script>alert('Hi!')</script><h1>Hello</h1>", description.rstrip())

        ssm.update_ops_item(
            OpsItemId=id,
            Status='Resolved',
        )

    def test_root_email_spam(self):

        GTUBE='XJS*C4JDBQADN1.NSBN3*2IDNEN*GTUBE-STANDARD-ANTI-UBE-TEST-EMAIL*C.34X'

        id = uuid.uuid4().hex
        self.send_email(id, GTUBE)

        time.sleep(10)

        res = ssm.get_ops_summary(
            Filters=[
                {
                    'Key': 'AWS:OpsItem.Title',
                    'Values': [
                        id,
                    ],
                    'Type': 'Equal',
                },
                {
                    'Key': 'AWS:OpsItem.Status',
                    'Values': [
                        'Open',
                    ],
                    'Type': 'Equal',
                },
            ],
        )

        self.assertEqual(0, len(res['Entities']))

    def test_root_email_virus(self):

        EICAR='X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'

        id = uuid.uuid4().hex
        self.send_email(id, EICAR)

        time.sleep(10)

        res = ssm.get_ops_summary(
            Filters=[
                {
                    'Key': 'AWS:OpsItem.Title',
                    'Values': [
                        id,
                    ],
                    'Type': 'Equal',
                },
                {
                    'Key': 'AWS:OpsItem.Status',
                    'Values': [
                        'Open',
                    ],
                    'Type': 'Equal',
                },
            ],
        )

        self.assertEqual(0, len(res['Entities']))

    def test_welcome_mail_get_filtered(self):

        id = uuid.uuid4().hex
        subject = 'Welcome to Amazon Web Services'
        self.send_email(id=id, subject=subject, body_text='some mail body')

        time.sleep(10)

        res = ssm.get_ops_summary(
            Filters=[
                {
                    'Key': 'AWS:OpsItem.Title',
                    'Values': [
                        subject,
                    ],
                    'Type': 'Equal',
                },
                {
                    'Key': 'AWS:OpsItem.Status',
                    'Values': [
                        'Open',
                    ],
                    'Type': 'Equal',
                },
            ],
        )

        self.assertEqual(0, len(res['Entities']))

    def test_account_ready_mail_get_filtered(self):

        id = uuid.uuid4().hex
        subject = 'Your AWS Account is Ready - Get Started Now'
        self.send_email(id=id, subject=subject, body_text='some mail body')

        time.sleep(10)

        res = ssm.get_ops_summary(
            Filters=[
                {
                    'Key': 'AWS:OpsItem.Title',
                    'Values': [
                        subject,
                    ],
                    'Type': 'Equal',
                },
                {
                    'Key': 'AWS:OpsItem.Status',
                    'Values': [
                        'Open',
                    ],
                    'Type': 'Equal',
                },
            ],
        )

        self.assertEqual(0, len(res['Entities']))