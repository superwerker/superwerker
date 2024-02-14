import { S3, SSM } from 'aws-sdk';
import { simpleParser } from 'mailparser';

const region = process.env.ROOTMAIL_DEPLOY_REGION;
const emailBucket = process.env.EMAIL_BUCKET;
const emailBucketArn = process.env.EMAIL_BUCKET_ARN;
const s3 = new S3();
const ssm = new SSM({ region: region });

const filteredEmailSubjects = ['Your AWS Account is Ready - Get Started Now', 'Welcome to Amazon Web Services'];

// from https://docs.aws.amazon.com/ses/latest/dg/receiving-email-action-lambda-event.html
export interface EventRecord {
  eventSource: string;
  eventVersion: string;
  ses: Ses;
}

export interface Ses {
  mail: Mail;
  receipt: Receipt;
}

export interface Mail {
  timestamp: string;
  source: string;
  messageId: string;
  destination: string[];
  headersTruncated: boolean;
  headers: Header[];
  commonHeaders: CommonHeaders;
}

export interface Header {
  name: string;
  value: string;
}

export interface CommonHeaders {
  returnPath: string;
  from: string[];
  date: string;
  to: string[];
  messageId: string;
  subject: string;
}

export interface Receipt {
  timestamp: string;
  processingTimeMillis: number;
  recipients: string[];
  spamVerdict: Verdict;
  virusVerdict: Verdict;
  spfVerdict: Verdict;
  dkimVerdict: Verdict;
  dmarcVerdict: Verdict;
  action: Action;
}

export interface Verdict {
  status: string;
}

export interface Action {
  type: string;
  functionArn: string;
  invocationType: string;
}

export interface SESEventRecordsToLambda {
  Records: EventRecord[];
}

export const handler = async (event: SESEventRecordsToLambda) => {
  log({
    event: event,
    level: 'debug',
  });

  for (const record of event.Records) {
    const id = record.ses.mail.messageId;
    const key = `RootMail/${id}`;
    const receipt = record.ses.receipt;

    log({
      id: id,
      level: 'debug',
      key: key,
      msg: 'processing mail',
    });

    const verdicts = {
      dkim: receipt.dkimVerdict.status,
      spam: receipt.spamVerdict.status,
      spf: receipt.spfVerdict.status,
      virus: receipt.virusVerdict.status,
    };

    for (const [k, v] of Object.entries(verdicts)) {
      if (v !== 'PASS') {
        log({
          class: k,
          value: v,
          id: id,
          key: key,
          level: 'warn',
          msg: 'verdict failed - ops santa item skipped',
        });

        return;
      }
    }

    const response = await s3.getObject({ Bucket: emailBucket as string, Key: key }).promise();

    const msg = await simpleParser(response.Body as Buffer);

    let title = msg.subject;

    if (title === undefined) {
      log({
        id: id,
        key: key,
        level: 'warn',
        msg: 'no subject found',
      });
      return;
    }

    if (filteredEmailSubjects.includes(title)) {
      log({
        level: 'info',
        msg: 'filtered email',
        title: title,
      });
      return;
    }

    const source = record.ses.mail.destination[0];

    if (title === 'Amazon Web Services Password Assistance') {
      if (msg.html === false) {
        log({
          id: id,
          key: key,
          level: 'warn',
          msg: 'no html body found in password assistance email',
        });
        return;
      }
      const description = msg.html;
      const pw_reset_link =
        description.match(/https:\/\/signin.aws.amazon.com\/resetpassword(.*?)(?=<br>)/)?.[0] || 'no passsord reset link';
      const rootmail_identifier = `/rootmail/pw_reset_link/${source.split('@')[0].split('root+')[1]}`;
      await ssm
        .putParameter({
          Name: rootmail_identifier,
          Value: pw_reset_link,
          Overwrite: true,
          Type: 'String',
          Tier: 'Advanced',
          Policies: JSON.stringify([
            {
              Type: 'Expiration',
              Version: '1.0',
              Attributes: {
                Timestamp: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
              },
            },
          ]),
        })
        .promise();
      log({
        id: id,
        key: key,
        level: 'info',
        msg: `created ssm param store entry '${rootmail_identifier}' for password assistance email`,
      });
      return; // no ops item for now
    }

    let description = msg.text || msg.html;
    if (!description) {
      log({
        id: id,
        key: key,
        level: 'warn',
        msg: 'no text or html body found',
      });
      return;
    }

    title = title.substring(0, 1020) + (title.length > 1020 ? ' ...' : '');

    description = description.substring(0, 1020) + (description.length > 1020 ? ' ...' : '');

    const sourceTruncated = source.substring(0, 60) + (source.length > 60 ? ' ...' : '');

    const operational_data = {
      '/aws/dedup': {
        Value: JSON.stringify({
          dedupString: id,
        }),
        Type: 'SearchableString',
      },
      '/aws/resources': {
        Value: JSON.stringify([
          {
            arn: `${emailBucketArn}/${key}`,
          },
        ]),
        Type: 'SearchableString',
      },
    };

    await ssm
      .createOpsItem({
        Description: description,
        OperationalData: operational_data,
        Source: sourceTruncated,
        Title: title,
      })
      .promise();
    log({
      id: id,
      key: key,
      level: 'info',
      msg: `created ops item with title '${title}'`,
    });
  }
};

function log(msg: object) {
  console.log(JSON.stringify(msg));
}
