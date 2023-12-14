import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm';

import axios from 'axios';


const ssmClient = new SSMClient();
const eventBridgeClient = new EventBridgeClient();

export async function handler(event: any, _context: any) {
  for (const account of event.accounts) {
    const name = `/superwerker/account_id_${(account.accountName as string).toLowerCase().replace(/ /g, '')}`;


    const putParameterCommand = new PutParameterCommand({
      Name: name,
      Value: account.accountId,
      Overwrite: true,
      Type: 'String',
    });

    await ssmClient.send(putParameterCommand);
  };

  // signal cloudformation stack that control tower setup is complete
  await axios.put(process.env.SIGNAL_URL!, {
    Status: 'SUCCESS',
    Reason: 'Control Tower Setup completed',
    UniqueId: 'doesthisreallyhavetobeunique',
    Data: 'Control Tower Setup completed',
  });

  // signal Control Tower Landing Zone Setup/Update has finished
  const putEventsCommand = new PutEventsCommand({
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

  await eventBridgeClient.send(putEventsCommand);

}
