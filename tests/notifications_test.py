import boto3
import json
import uuid
import pytest
from retrying import retry


cf = boto3.client('cloudformation')
sqs = boto3.client('sqs')
sns = boto3.client('sns')
ssm = boto3.client('ssm')



@pytest.fixture(scope="module")
def notification_stack():
    stack_prefix = 'superwerker-Notifications'
    stack_list = cf.list_stacks(
        StackStatusFilter=['CREATE_COMPLETE', 'UPDATE_COMPLETE']
    )

    stack = [stack for stack in stack_list['StackSummaries']
                if stack['StackName'].startswith(stack_prefix)].pop()

    return stack

@pytest.fixture(scope="module")
def sns_topic_arn_from_notification_stack(notification_stack):

    print('fetching SNS notification topic name from stack "{}"'.format(
        notification_stack['StackName']))

    res = cf.describe_stacks(
        StackName=notification_stack['StackId'],
    )

    return res['Stacks'][0]['Outputs'][0]['OutputValue']

@pytest.fixture(scope="module")
def queue_for_sns_subscription(queue_name):
    queue_policy = {
        'Version': '2012-10-17',
        'Statement': [
            {
                'Effect': 'Allow',
                'Principal': {
                    'Service': 'sns.amazonaws.com'
                },
                'Action': 'sqs:*',
                'Resource': '*'
            }
        ]
    }

    print('generating temp queue "{}"'.format(queue_name))

    return sqs.create_queue(
        Attributes={
            'Policy': json.dumps(queue_policy),
        },
        QueueName=queue_name,
    )

@pytest.fixture(scope="module")
def queue_name():
    return uuid.uuid4().hex

@pytest.fixture(scope="module")
def sqs_subscription_arn(sns_topic_arn_from_notification_stack, queue_name):
    print('subscribing to temp queue "{}"'.format(queue_name))

    account = boto3.client('sts').get_caller_identity().get('Account')
    region = boto3.session.Session().region_name

    res = sns.subscribe(
        TopicArn=sns_topic_arn_from_notification_stack,
        Protocol='sqs',
        Endpoint='arn:aws:sqs:{region}:{account}:{queue_name}'.format(
            account=account,
            region=region,
            queue_name=queue_name,
        )
    )

    return res['SubscriptionArn']

def creat_ops_item(id):
    print('creating ops item with test id "{}"'.format(id))

    res = ssm.create_ops_item(
        Description='Description-{}'.format(id),
        Source='test',
        Title="Title-{}".format(id),
    )

    return res['OpsItemId']

@pytest.fixture
def queue_url_for_sns_subscription(sqs_subscription_arn, queue_for_sns_subscription):
    yield queue_for_sns_subscription['QueueUrl']
    sns.unsubscribe(SubscriptionArn=sqs_subscription_arn)
    sqs.delete_queue(QueueUrl=queue_for_sns_subscription['QueueUrl'])

def test_receive_ops_item_notification(queue_url_for_sns_subscription):

    id = uuid.uuid4().hex
    ops_item_id = creat_ops_item(id)

    msgs = wait_for_message(queue_url_for_sns_subscription)
    body = json.loads(msgs[0]['Body'])
    link = "https://{}.console.aws.amazon.com/systems-manager/opsitems/{}".format(
        boto3.session.Session().region_name, ops_item_id)

    assert 1 == len(msgs)
    assert "New OpsItem: Title-{}".format(id) == body['Subject']
    assert "Description-{}\n\n{}".format(id, link) == body['Message']

    ssm.update_ops_item(
        OpsItemId=ops_item_id,
        Status='Resolved',
    )


@retry(stop_max_delay=60000, wait_fixed=5000)
def wait_for_message(queue_url):
    res = sqs.receive_message(
        QueueUrl=queue_url,
        WaitTimeSeconds=5,
    )

    if res.get('Messages', None) == None:
        raise Exception('no sqs message received')

    return res['Messages']