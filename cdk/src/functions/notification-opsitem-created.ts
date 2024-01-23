import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

const snsClient = new SNSClient();

export async function handler(_event:any, _context:any) {
  const region = process.env.AWS_REGION;
  const response_elements = _event.detail.responseElements;
  const id = response_elements.OpsItemId;
  const request_parameters = _event.detail.requestParameters;
  const desc = request_parameters.description;
  const title = request_parameters.title;

  const url = `https://${region}.console.aws.amazon.com/systems-manager/opsitems/${id}`;

  log({
    desc: desc,
    event: _event,
    level: 'info',
    msg: 'Publishing new ops item event from CloudTrail to SNS',
    title: title,
    url: url,
  });

  const message_title = `New OpsItem: ${title}`;
  const message_body = `${desc}\n\n${url}`;

  await snsClient.send(new PublishCommand({
    Message: message_body,
    Subject: message_title,
    TopicArn: process.env.TOPIC_ARN,
  }));
}

function log(msg:any) {
  console.log(JSON.stringify(msg));
}