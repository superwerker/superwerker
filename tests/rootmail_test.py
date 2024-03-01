import pytest
import boto3
import uuid
from retrying import retry
import warnings

ses = boto3.client('ses', region_name='eu-west-1')
ssm = boto3.client('ssm')


# https://github.com/boto/boto3/issues/454
@pytest.fixture(autouse=True)
def ignore_warnings():
    warnings.filterwarnings("ignore", category=ResourceWarning, message="unclosed.*<ssl.SSLSocket.*>")

def test_root_email_body_text():

    id = uuid.uuid4().hex
    send_email(id, 'This is a mail body')

    res = get_ops_item_by_title(id)

    assert 1 == len(res['Entities'])

    id = res['Entities'][0]['Id']
    description = res['Entities'][0]['Data']['AWS:OpsItem']['Content'][0]['Description']

    assert 'This is a mail body' == description.rstrip()

    ssm.update_ops_item(
        OpsItemId=id,
        Status='Resolved',
    )

def test_root_email_body_text_and_html():

    id = uuid.uuid4().hex
    send_email(id, 'This is another mail body', "<h1>This should be ignored</h1>")

    res = get_ops_item_by_title(id)

    assert 1 == len(res['Entities'])

    id = res['Entities'][0]['Id']
    description = res['Entities'][0]['Data']['AWS:OpsItem']['Content'][0]['Description']

    assert 'This is another mail body' == description.rstrip()

    ssm.update_ops_item(
        OpsItemId=id,
        Status='Resolved',
    )

def test_root_email_body_html():

    id = uuid.uuid4().hex
    send_email(id, None, "<script>alert('Hi!')</script><h1>Hello</h1>")

    res = get_ops_item_by_title(id)

    assert 1 == len(res['Entities'])

    id = res['Entities'][0]['Id']
    description = res['Entities'][0]['Data']['AWS:OpsItem']['Content'][0]['Description']

    assert "<script>alert('Hi!')</script><h1>Hello</h1>" == description.rstrip()

    ssm.update_ops_item(
        OpsItemId=id,
        Status='Resolved',
    )

def test_root_email_virus():

    EICAR='X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'

    id = uuid.uuid4().hex
    send_email(id, EICAR)

    res = wait_for_get_ops_summary(
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

    assert 0 == len(res['Entities'])

def test_welcome_mail_get_filtered():

    id = uuid.uuid4().hex
    subject = 'Welcome to Amazon Web Services'
    send_email(id=id, subject=subject, body_text='some mail body')

    res = wait_for_get_ops_summary(
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

    assert 0 == len(res['Entities'])

def test_account_ready_mail_get_filtered():

    id = uuid.uuid4().hex
    subject = 'Your AWS Account is Ready - Get Started Now'
    send_email(id=id, subject=subject, body_text='some mail body')

    res = wait_for_get_ops_summary(
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

    assert 0 == len(res['Entities'])

def send_email(id, body_text=None, body_html=None, subject=None):

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


@retry(wait_exponential_multiplier=1000, wait_exponential_max=10000, stop_max_delay=20000)
def get_ops_item_by_title(title):
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

@retry(wait_exponential_multiplier=1000, wait_exponential_max=10000, stop_max_delay=20000)
def wait_for_get_ops_summary(**kwargs):
    return ssm.get_ops_summary(**kwargs)

