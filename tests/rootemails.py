import os
import unittest
import boto3
import uuid
import time

# TODO: adopt this to work in other regions as well
ses = boto3.client('ses', region_name='eu-west-1')
ssm = boto3.client('ssm', region_name='eu-west-1')

class RootemailsTestCase(unittest.TestCase):

    @classmethod
    def send_email(cls, id, body):

        res = ses.list_identities(
            IdentityType='Domain',
            MaxItems=1,
        )

        domain = res['Identities'][0]

        res = ses.send_email(
            Source="test@{domain}".format(domain=domain),
            Destination={
                'ToAddresses': [
                    "root+{id}@{domain}".format(domain=domain, id=id),
                ],
            },
            Message={
                'Subject': {
                    'Data': id,
                },
                'Body': {
                    'Text': {
                        'Data': body,
                    },
                },
            },
        )

        return res

    def test_root_email(self):

        id = uuid.uuid4().hex
        self.send_email(id, 'This is a mail body')

        time.sleep(10)

        res = ssm.describe_ops_items(
            OpsItemFilters=[
                {
                    'Key': 'Title',
                    'Values': [
                        "'{id}'".format(id=id[:18]), # ops center filters don't like contains with longer targets

                    ],
                    'Operator': 'Contains',
                },
                {
                    'Key': 'Status',
                    'Values': [
                        'Open',
                    ],
                    'Operator': 'Equal',
                },
            ],
        )

        self.assertEqual(1, len(res.get('OpsItemSummaries', [])))

        id = res['OpsItemSummaries'][0]['OpsItemId']

        res = ssm.get_ops_item(
            OpsItemId=id,
        )

        self.assertEqual('This is a mail body', res['OpsItem']['Description'].rstrip())

        ssm.update_ops_item(
            OpsItemId=id,
            Status='Resolved',
        )

    def test_root_email_spam(self):

        GTUBE='XJS*C4JDBQADN1.NSBN3*2IDNEN*GTUBE-STANDARD-ANTI-UBE-TEST-EMAIL*C.34X'

        id = uuid.uuid4().hex
        self.send_email(id, GTUBE)

        time.sleep(10)

        res = ssm.describe_ops_items(
            OpsItemFilters=[
                {
                    'Key': 'Title',
                    'Values': [
                        "'{id}'".format(id=id[:18]), # ops center filters don't like contains with longer targets

                    ],
                    'Operator': 'Contains',
                },
                {
                    'Key': 'Status',
                    'Values': [
                        'Open',
                    ],
                    'Operator': 'Equal',
                },
            ],
        )

        self.assertEqual(0, len(res.get('OpsItemSummaries', [])))

    def test_root_email_virus(self):

        EICAR='X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'

        id = uuid.uuid4().hex
        self.send_email(id, EICAR)

        time.sleep(10)

        res = ssm.describe_ops_items(
            OpsItemFilters=[
                {
                    'Key': 'Title',
                    'Values': [
                        "'{id}'".format(id=id[:18]), # ops center filters don't like contains with longer targets

                    ],
                    'Operator': 'Contains',
                },
                {
                    'Key': 'Status',
                    'Values': [
                        'Open',
                    ],
                    'Operator': 'Equal',
                },
            ],
        )

        self.assertEqual(0, len(res.get('OpsItemSummaries', [])))
