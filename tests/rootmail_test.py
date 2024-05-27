import pytest
import boto3
import uuid
from retrying import retry
import warnings
from exchangelib import Credentials, Account, Configuration, DELEGATE, BASIC, Build, Version, ExtendedProperty, Message


class IconIndex(ExtendedProperty):
    # https://learn.microsoft.com/en-us/office/client-developer/outlook/mapi/pidtagiconindex-canonical-property?redirectedfrom=MSDN
    property_tag = 0x1080
    property_type = "Integer"

ses = boto3.client('ses', region_name='eu-west-1')
ssm = boto3.client('ssm')
workmail = boto3.client('workmail', region_name='eu-west-1')

# https://github.com/boto/boto3/issues/454
@pytest.fixture(autouse=True)
def ignore_warnings():
    warnings.filterwarnings("ignore", category=ResourceWarning, message="unclosed.*<ssl.SSLSocket.*>")

@pytest.fixture(scope='session')
def domain():
    res = ses.list_identities(
        IdentityType='Domain',
    )
    return [identity for identity in res['Identities'] if "superwerker" in identity][0]

@pytest.fixture(scope='session')
def email_subject():
    id = uuid.uuid4().hex
    return id

@pytest.fixture(scope='session')
def email_account(domain):
    ssmRes = ssm.get_parameter(
        Name="/superwerker/rootmail_password", 
        WithDecryption=True)
    password = ssmRes['Parameter']['Value']

    credentials = Credentials(username="root@{domain}".format(domain=domain), password=password)

    config = Configuration(
        credentials=credentials, 
        service_endpoint='https://ews.mail.eu-west-1.awsapps.com/EWS/Exchange.asmx',
        auth_type='basic'
    )

    account = Account(
        primary_smtp_address="root@{domain}".format(domain=domain),
        config=config,
        autodiscover=False
    )

    Message.register("icon_index", IconIndex)

    return account

def test_workmail_resources_exist(domain):

    orgList = workmail.list_organizations()
    activeOrg = [org for org in orgList['OrganizationSummaries'] if org['State'] == 'Active']

    assert domain == activeOrg[0]['DefaultMailDomain']

    orgId = activeOrg[0]['OrganizationId']

    userList = workmail.list_users(
        OrganizationId = orgId,
        Filters = {
            'PrimaryEmailPrefix': 'root@{domain}'.format(domain=domain),
        }
    )

    assert 1 == len(userList['Users'])
    assert 'ENABLED' == userList['Users'][0]['State']

@pytest.mark.dependency()
def test_email_delivery(domain, email_subject, email_account):

    send_email(domain, email_subject, 'This is a mail body')


    msg = get_email_by_subject(email_subject, email_account)

    assert "test@{domain}".format(domain=domain) == msg.sender.email_address
    assert email_subject == msg.subject


@pytest.mark.dependency(depends=['test_email_delivery'])
def test_email_redirect_rule(email_subject, email_account):
    msg = get_email_by_subject(email_subject, email_account)
    print(msg.icon_index)
    print(email_subject)

    # Assert that message has been forwarded 
    # https://learn.microsoft.com/en-us/office/client-developer/outlook/mapi/pidtagiconindex-canonical-property?redirectedfrom=MSDN
    assert 262 == msg.icon_index 

def send_email(domain, id, body_text=None, body_html=None, subject=None):

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
def get_email_by_subject(subject, account):
    msgQuerySet = account.inbox.filter(subject__contains=subject)

    if msgQuerySet.count() == 0:
        raise
    else:
        return msgQuerySet[0]


