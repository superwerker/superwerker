import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

const snsClient = new SNSClient();

export async function handler(event: any, _context: any) {
  const region = process.env.AWS_REGION;
  const responseElements = event.detail.responseElements;
  const id = responseElements.opsItemId;
  const requestParameters = event.detail.requestParameters;
  const desc = requestParameters.description;
  const title = requestParameters.title;
  const url = `https://${region}.console.aws.amazon.com/systems-manager/opsitems/${id}`;
  const topicARN = process.env.TOPIC_ARN;

  console.log({
    event,
    requestParameters,
    responseElements,
    level: 'info',
    msg: 'Publishing new ops item event from CloudTrail to SNS',
    desc,
    title,
    url,
  });

  const messageTitle = `New OpsItem: ${title}`;
  const messageBody = `${desc}\n\n${url}`;

  await snsClient.send(
    new PublishCommand({
      Message: messageBody,
      Subject: messageTitle,
      TopicArn: topicARN, //process.env.TOPIC_ARN,
    }),
  );
}
