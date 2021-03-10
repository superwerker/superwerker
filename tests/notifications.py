import boto3
import json
import unittest
import uuid
import itertools

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

    @staticmethod
    def retrieve_sns_topic_arn_from_stack():
        stack_name = 'superwerker-Notifications-11CMJT238WB5B'

        print('fetching SNS notification topic name from stack "{}"'.format(stack_name))

        res = cf.describe_stacks(
            StackName=stack_name,
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
            Description='Desc "{}"'.format(id),
            Source='test',
            Title='Title "{}"'.format(id),
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

        # TODO: add timeout
        for n in itertools.count(start=1):
            print('waiting for messages (iteration {})'.format(n))

            res = sqs.receive_message(
                QueueUrl=queue_url,
                WaitTimeSeconds=10,
            )

            if n > (15*60/10):
                self.fail(
                    'waited for too many iterations ({}) and am tired of it'.format(n))

            if res.get('Messages', None) != None:

                msgs = res['Messages']
                body = json.loads(msgs[0]['Body'])

                self.assertEqual(1, len(msgs))
                self.assertEqual('Title "{}"'.format(id), body['Subject'])
                self.assertEqual('Desc "{}"'.format(id), body['Message'])

                break

        print('resolving ops item "{}"'.format(ops_item_id))

        ssm.update_ops_item(
            OpsItemId=ops_item_id,
            Status='Resolved',
        )

        self.cleanup(subscription_arn, queue_url)
