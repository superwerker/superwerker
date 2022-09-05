import { injectLambdaContext, Logger } from '@aws-lambda-powertools/logger';
import middy from '@middy/core';
import { CloudFormationCustomResourceEvent, Context } from 'aws-lambda';
import AWS from 'aws-sdk';
import { FAILED, send, SUCCESS } from 'cfn-response';

function getOrgRootArn(org: AWS.Organizations, logger: Logger) {
  return async (event: CloudFormationCustomResourceEvent, context: any) => {
    const RequestType = event.RequestType;
    const OrgId = (await org.describeOrganization().promise()).Organization?.Id!;
    const RootId = (await org.listRoots().promise()).Roots![0].Id;

    logger.debug('Input parameters', {
      RequestType,
      OrgId,
      RootId,
    });

    send(event, context, SUCCESS, { OrgId, RootId });
  };
}
const organizations = new AWS.Organizations({ region: 'us-east-1' });
const logger = new Logger();

export const handler = middy(
  getOrgRootArn(organizations, logger),
).use(
  injectLambdaContext(logger, { logEvent: true }),
).onError((request: middy.Request<any, any, Error, Context>) => {
  logger.error('Error in lambda execution', request.error!);
  send(request.event, request.context, FAILED, {});
  // break the middleware chain here
  return;
});
