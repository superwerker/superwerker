import boto3
import json
import unittest
import uuid
import itertools
from retrying import retry

cf = boto3.client('cloudformation')
sqs = boto3.client('sqs')
sns = boto3.client('sns')
ssm = boto3.client('ssm')


class NotificationsTestCase(unittest.TestCase):
    @staticmethod
    def create_queue_for_sns_subscription(queue_name):
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

        res = sqs.create_queue(
            Attributes={
                'Policy': json.dumps(queue_policy),
            },
            QueueName=queue_name,
        )

        return res['QueueUrl']

    def retrieve_sns_topic_arn_from_stack(self):
        stack = self.wait_for_stack()

        print('fetching SNS notification topic name from stack "{}"'.format(
            stack['StackName']))

        res = cf.describe_stacks(
            StackName=stack['StackId'],
        )

        return res['Stacks'][0]['Outputs'][0]['OutputValue']

    @staticmethod
    def add_sqs_subscription_to_topic(topic_arn, queue_name):
        print('subscribing to temp queue "{}"'.format(queue_name))

        account = boto3.client('sts').get_caller_identity().get('Account')
        region = boto3.session.Session().region_name

        res = sns.subscribe(
            TopicArn=topic_arn,
            Protocol='sqs',
            Endpoint='arn:aws:sqs:{region}:{account}:{queue_name}'.format(
                account=account,
                region=region,
                queue_name=queue_name,
            )
        )

        return res['SubscriptionArn']

    @staticmethod
    def creat_ops_item(id):
        print('creating ops item with test id "{}"'.format(id))

        res = ssm.create_ops_item(
            Description='Description-{}'.format(id),
            Source='test',
            Title="Title-{}".format(id),
        )

        return res['OpsItemId']

    @staticmethod
    def cleanup(subscription_arn, queue_url):
        print('unsubscribing from temp queue via "{}"'.format(subscription_arn))

        sns.unsubscribe(
            SubscriptionArn=subscription_arn,
        )

        print('deleting temp queue "{}"'.format(queue_url))

        sqs.delete_queue(
            QueueUrl=queue_url,
        )

    @staticmethod
    @retry(stop_max_delay=1800000, wait_fixed=20000)
    def wait_for_stack():
        stack_prefix = 'superwerker-Notifications'
        stack_list = cf.list_stacks(
            StackStatusFilter=['CREATE_COMPLETE', 'UPDATE_COMPLETE']
        )

        stack = [stack for stack in stack_list['StackSummaries']
                 if stack['StackName'].startswith(stack_prefix)].pop()

        return stack

    @staticmethod
    @retry(stop_max_delay=30000, wait_fixed=5000)
    def wait_for_message(queue_url):
        res = sqs.receive_message(
            QueueUrl=queue_url,
            WaitTimeSeconds=5,
        )

        if res.get('Messages', None) == None:
            raise

        return res['Messages']

    def test_receive_ops_item_notification(self):
        queue_name = uuid.uuid4().hex

        topic_arn = self.retrieve_sns_topic_arn_from_stack()
        queue_url = self.create_queue_for_sns_subscription(queue_name)

        subscription_arn = self.add_sqs_subscription_to_topic(
            topic_arn,
            queue_name,
        )

        id = uuid.uuid4().hex
        ops_item_id = self.creat_ops_item(id)

        msgs = self.wait_for_message(queue_url)
        body = json.loads(msgs[0]['Body'])
        link = "https://{}.console.aws.amazon.com/systems-manager/opsitems/{}".format(
            boto3.session.Session().region_name, ops_item_id)

        self.assertEqual(1, len(msgs))
        self.assertEqual(
            "New OpsItem: Title-{}".format(id), body['Subject'])
        self.assertEqual(
            "Description-{}\n\n{}".format(id, link), body['Message'])

        print('resolving ops item "{}"'.format(ops_item_id))

        ssm.update_ops_item(
            OpsItemId=ops_item_id,
            Status='Resolved',
        )

        self.cleanup(subscription_arn, queue_url)
