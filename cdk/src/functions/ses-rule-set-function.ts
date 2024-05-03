import { SESClient, SetActiveReceiptRuleSetCommand } from '@aws-sdk/client-ses';

const ses = new SESClient({ region: 'eu-west-1' });

export async function handler(event: any) {
  console.log(event);

  await ses.send(
    new SetActiveReceiptRuleSetCommand({
      RuleSetName: 'RootMail-v2',
    }),
  );
}
