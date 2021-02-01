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

    def test_receive_ops_item_notification(self):

        account = boto3.client('sts').get_caller_identity().get('Account')
        region = boto3.session.Session().region_name

        stack_name = 'notifactions'

        print('fetching SNS notification topic name from stack "{}"'.format(stack_name))

        res = cf.describe_stacks(
            StackName=stack_name,
        )

        topic_arn = res['Stacks'][0]['Outputs'][0]['OutputValue']

        queue_name = uuid.uuid4().hex

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

        queue_url = res['QueueUrl']

        print('subscribing to temp queue "{}"'.format(queue_name))

        res = sns.subscribe(
            TopicArn=topic_arn,
            Protocol='sqs',
            Endpoint='arn:aws:sqs:{region}:{account}:{queue_name}'.format(
                account=account,
                region=region,
                queue_name=queue_name,
            )
        )

        subscription_arn = res['SubscriptionArn']

        # now for the test ...

        id = uuid.uuid4().hex

        print('creating ops item with test id "{}"'.format(id))

        res = ssm.create_ops_item(
          Description='Desc "{}"'.format(id),
          Source='test',
          Title='Title "{}"'.format(id),
        )

        ops_item_id = res['OpsItemId']

        # TODO: add timeout
        for n in itertools.count(start=1):

            print('waiting for messages (iteration {})'.format(n))

            res = sqs.receive_message(
                QueueUrl=queue_url,
                WaitTimeSeconds=10,
            )

            if n > (15*60/10):
                self.fail('waited for too many iterations ({}) and am tired of it'.format(n))

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

        print('unsubscribing from temp queue via "{}"'.format(subscription_arn))

        sns.unsubscribe(
            SubscriptionArn=subscription_arn,
        )

        print('deleting temp queue "{}"'.format(queue_url))

        sqs.delete_queue(
            QueueUrl=queue_url,
        )

        print("done")
