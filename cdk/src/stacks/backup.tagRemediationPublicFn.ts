import { injectLambdaContext, Logger } from '@aws-lambda-powertools/logger';
import middy from '@middy/core';
import { CloudFormationCustomResourceEvent, Context } from 'aws-lambda';
import AWS from 'aws-sdk';
import { FAILED, send, SUCCESS } from 'cfn-response';


const CREATE = 'Create';
const DELETE = 'Delete';
const UPDATE = 'Update';

function backupTagRemediation(ssm: AWS.SSM) {
  return async (event: CloudFormationCustomResourceEvent, context: Context) => {
    const RequestType = event.RequestType;
    const PhysicalResourceId = 'PhysicalResourceId' in event ? event.PhysicalResourceId: null;
    const Properties = event.ResourceProperties;
    const DocumentName = Properties.DocumentName;

    const id = `${PhysicalResourceId}-${DocumentName}`;

    const data = {};

    if (RequestType == CREATE || RequestType == UPDATE) {
      ssm.modifyDocumentPermission({
        Name: DocumentName,
        PermissionType: 'Share',
        AccountIdsToAdd: ['All'],
      });
    } else if (RequestType == DELETE) {
      ssm.modifyDocumentPermission({
        Name: DocumentName,
        PermissionType: 'Share',
        AccountIdsToRemove: ['All'],
      });
    };

    send(event, context, SUCCESS, data, id);
  };
}


const ssm = new AWS.SSM();
const logger = new Logger();

export const handler = middy(
  backupTagRemediation(ssm),
).use(
  injectLambdaContext(logger, { logEvent: true }),
).onError((request: middy.Request<any, any, Error, Context>) => {
  logger.error('Error in lambda execution', request.error!);
  send(request.event, request.context, FAILED, {});
  // break the middleware chain here
  return;
});
