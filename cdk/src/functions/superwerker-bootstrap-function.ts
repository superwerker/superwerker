import AWS from 'aws-sdk';

import axios from 'axios';

const ssm = new AWS.SSM();
const events = new AWS.EventBridge();

export async function handler(event: any, _context: any) {
  event.accounts.forEach((account: any) => {
    const Name = `/superwerker/account_id_${(account.accountName as string).toLowerCase().replaceAll(' ', '')}`;

    ssm.putParameter({
      Name,
      Value: account.accountId,
      Overwrite: true,
      Type: 'String',
    });
  });

  // signal cloudformation stack that control tower setup is complete
  await axios.put(process.env.SIGNAL_URL!, {
    Status: 'SUCCESS',
    Reason: 'Control Tower Setup completed',
    UniqueId: 'doesthisreallyhavetobeunique',
    Data: 'Control Tower Setup completed',
  });

  // signal Control Tower Landing ZOne Setup/Update has finished
  events.putEvents({
    Entries: [
      {
        DetailType: 'superwerker-event',
        Detail: JSON.stringify(
          {
            eventName: 'LandingZoneSetupOrUpdateFinished',
          },
        ),
        Source: 'superwerker',
      },
    ],
  });
}
