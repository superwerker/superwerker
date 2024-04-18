import {
  AttachPolicyCommand,
  CreateOrganizationCommand,
  CreatePolicyCommand,
  DetachPolicyCommand,
  OrganizationsClient,
  UpdatePolicyCommand,
} from '@aws-sdk/client-organizations';
import * as AWSCDKAsyncCustomResource from 'aws-cdk-lib/custom-resources/lib/provider-framework/types';

async function getRootId(client: OrganizationsClient) {
  const command = new CreateOrganizationCommand({ FeatureSet: 'ALL' });
  return client.send(command);
}

export async function handler(event: AWSCDKAsyncCustomResource.OnEventRequest): Promise<AWSCDKAsyncCustomResource.OnEventResponse> {
  const organizationClient = new OrganizationsClient({ region: 'us-east-1' });

  let policyDocument = event.ResourceProperties.policyDocument;
  let attach = event.ResourceProperties.attach;
  let description = event.ResourceProperties.description;
  let name = event.ResourceProperties.name;
  let type = event.ResourceProperties.type;
  let policyId = event.ResourceProperties.policyId;

  const inputPolicy = {
    // CreatePolicyRequest
    Content: policyDocument,
    Description: description,
    Name: name,
    Type: type,
    PolicyId: policyId,
  };

  switch (event.RequestType) {
    case 'Create':
      console.log('Creating Policy: ', event.LogicalResourceId);

      //Update the description to have the LogicalResourceId.
      inputPolicy.Description = `superwerker - ${event.LogicalResourceId}`;

      const commandCreatePolicy = new CreatePolicyCommand(inputPolicy);
      const response = await organizationClient.send(commandCreatePolicy);
      policyId = response?.Policy?.PolicySummary?.Id;

      if (attach) {
        const inputAttachPolicy = {
          // AttachPolicyRequest
          PolicyId: policyId,
          TargetId: (await getRootId(organizationClient)).Organization?.Id,
        };
        const commandAttachPolicy = new AttachPolicyCommand(inputAttachPolicy);
        const responseAttachPolicy = await organizationClient.send(commandAttachPolicy);
        return responseAttachPolicy;
      }
      return {};

    case 'Update':
      console.log('Updating Policy: ', event.LogicalResourceId);
      const commandUpdatePolicy = new UpdatePolicyCommand(inputPolicy);
      const responseUpdatePolicy = await organizationClient.send(commandUpdatePolicy);
      return responseUpdatePolicy;

    case 'Delete':
      console.log('Deleting Policy: ', event.LogicalResourceId);

      const inputDetachPolicy = {
        // DetachPolicyRequest
        PolicyId: event.ResourceProperties.policyId,
        TargetId: (await getRootId(organizationClient)).Organization?.Id,
      };
      try {
        const commandDeletePolicy = new DetachPolicyCommand(inputDetachPolicy);
        const responseDeletePolicy = await organizationClient.send(commandDeletePolicy);
        return responseDeletePolicy;
      } catch (e) {
        console.log(`${inputDetachPolicy.PolicyId} is no valid PolicyId`);
      }
      return {};
  }
}
