import boto3
import json
import os

client = boto3.client('sns')


def handler(event, context):
    response_elements = event['detail']['responseElements']
    id = response_elements.get('OpsItemId', response_elements.get('opsItemId'))
    request_parameters = event['detail']['requestParameters']
    desc = request_parameters.get(
        'Description', request_parameters.get('description'))
    title = request_parameters.get('Title', request_parameters.get('title'))
    assert id and title and desc

    url = "https://{}.console.aws.amazon.com/systems-manager/opsitems/{}".format(
        os.environ['AWS_REGION'], id)

    log({
        'desc': desc,
        'event': event,
        'level': 'info',
        'msg': 'Publishing new ops item event from CloudTrail to SNS',
        'title': title,
        'url': url,
    })

    message_title = "New OpsItem: {}".format(title)
    message_body = "{}\n\n{}".format(desc, url)

    client.publish(
        Message=message_body,
        Subject=message_title,
        TopicArn=os.environ['TOPIC_ARN'],
    )

    def log(msg):
        print(json.dumps(msg), flush=True)
