import {
  AttachPolicyCommand,
  CreatePolicyCommand,
  DeletePolicyCommand,
  DetachPolicyCommand,
  ListPoliciesCommand,
  ListRootsCommand,
  OrganizationsClient,
  UpdatePolicyCommand,
} from '@aws-sdk/client-organizations';
import { CloudFormationCustomResourceCreateEvent, Context } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { handler } from '../../src/functions/service-control-policies-root';

const organizationClientMock = mockClient(OrganizationsClient);
const rootAccountName = 'test-root-account';
const rootAccountId = 'test-root-id';
const logicalResourceId = 'superwerker - SCPRoot';
const scpName = 'superwerker-root';
const policyId = 'test-policy-id';
const updatedSCPPolicy = '{"Version": "2012-10-17", "Statement": [/* UPDATED policy document */]}';
const description = 'superwerker - SCPRoot';

describe('service control policies', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    organizationClientMock.reset();
    process.env.AWS_REGION = 'us-east-1';
  });

  afterEach(() => {
    delete process.env.AWS_REGION;
  });

  it('create service control policy', async () => {
    organizationClientMock.on(ListRootsCommand).resolves({
      Roots: [
        {
          Id: rootAccountId,
          Name: rootAccountName,
        },
      ],
    });

    organizationClientMock.on(ListPoliciesCommand).resolves({
      Policies: [
        {
          Name: scpName,
          Id: logicalResourceId,
          Description: description,
        },
      ],
    });

    organizationClientMock.on(CreatePolicyCommand).resolves({
      Policy: {
        PolicySummary: {
          Name: scpName,
          Id: policyId,
        },
      },
    });

    organizationClientMock.on(AttachPolicyCommand).resolves({});

    const response = await handler(
      {
        RequestType: 'Create',
        ResourceProperties: {
          includeSecHub: 'Yes',
          includeBackup: 'Yes',
          partition: 'eu-central-1',
          scpName: 'superwerker-root',
        },
      } as unknown as CloudFormationCustomResourceCreateEvent,
      {} as Context,
    );

    expect(response).toMatchObject({ SUCCESS: 'SCPs have been successfully created for Root account' });
  });

  it('create service control policy sechub', async () => {
    organizationClientMock.on(ListRootsCommand).resolves({
      Roots: [
        {
          Id: rootAccountId,
          Name: rootAccountName,
        },
      ],
    });

    organizationClientMock.on(ListPoliciesCommand).resolves({
      Policies: [
        {
          Name: scpName,
          Id: logicalResourceId,
          Description: description,
        },
      ],
    });

    organizationClientMock.on(CreatePolicyCommand).resolves({
      Policy: {
        PolicySummary: {
          Name: scpName,
          Id: policyId,
        },
      },
    });

    organizationClientMock.on(AttachPolicyCommand).resolves({});

    const response = await handler(
      {
        RequestType: 'Create',
        ResourceProperties: {
          includeSecHub: 'No',
          includeBackup: 'No',
          partition: 'eu-central-1',
          scpName: 'superwerker-root',
        },
      } as unknown as CloudFormationCustomResourceCreateEvent,
      {} as Context,
    );

    expect(response).toMatchObject({ SUCCESS: 'SCPs have been successfully created for Root account' });
  });

  it('update service control policy', async () => {
    organizationClientMock.on(ListPoliciesCommand).resolves({
      Policies: [
        {
          Name: scpName,
          Id: logicalResourceId,
          Description: description,
        },
      ],
    });

    organizationClientMock.on(UpdatePolicyCommand).resolves({
      Policy: {
        Content: '{"Version": "2012-10-17", "Statement": [/* UPDATED policy document */]}',
        PolicySummary: {
          Id: policyId,
          Name: scpName,
        },
      },
    });

    const response = await handler(
      {
        RequestType: 'Update',
        ResourceProperties: {
          includeSecHub: 'Yes',
          includeBackup: 'Yes',
          partition: 'eu-central-1',
          scpName: 'superwerker-root',
        },
      } as unknown as CloudFormationCustomResourceCreateEvent,
      {} as Context,
    );

    expect(response.Policy.Content).toEqual(updatedSCPPolicy);
    expect(response).toMatchObject({
      Policy: {
        Content: updatedSCPPolicy,
        PolicySummary: {
          Id: policyId,
          Name: scpName,
        },
      },
    });
  });

  it('delete service control policy', async () => {
    organizationClientMock.on(ListRootsCommand).resolves({
      Roots: [
        {
          Id: rootAccountId,
          Name: rootAccountName,
        },
      ],
    });

    organizationClientMock.on(ListPoliciesCommand).resolves({
      Policies: [
        {
          Name: scpName,
          Id: policyId,
          Description: description,
        },
      ],
    });

    organizationClientMock.on(DetachPolicyCommand).resolves({});
    organizationClientMock.on(DeletePolicyCommand).resolves({});

    await handler(
      {
        RequestType: 'Delete',
        ResourceProperties: {
          scpName: scpName,
        },
      } as unknown as CloudFormationCustomResourceCreateEvent,
      {} as Context,
    );

    expect(organizationClientMock).toHaveReceivedCommandWith(DetachPolicyCommand, {
      PolicyId: policyId,
      TargetId: rootAccountId,
    });

    expect(organizationClientMock).toHaveReceivedCommandWith(DeletePolicyCommand, {
      PolicyId: policyId,
    });
  });

  it('no root account found in organization', async () => {
    organizationClientMock.on(ListRootsCommand).resolves({
      Roots: [],
    });

    try {
      await handler(
        {
          RequestType: 'Create',
          ResourceProperties: {
            Description: logicalResourceId,
            scpName: scpName,
          },
        } as unknown as CloudFormationCustomResourceCreateEvent,
        {} as Context,
      );
    } catch (e) {
      expect(e).toMatchObject(new Error('No root account found in the organization'));
    }
  });

  it('no matching policy found', async () => {
    organizationClientMock.on(ListPoliciesCommand).resolves({
      Policies: [
        {
          Name: scpName,
          Id: logicalResourceId,
          Description: description,
        },
      ],
    });

    organizationClientMock.on(UpdatePolicyCommand).resolves({
      Policy: {
        Content: '{"Version": "2012-10-17", "Statement": [/* UPDATED policy document */]}',
        PolicySummary: {
          Id: policyId,
          Name: scpName,
        },
      },
    });

    try {
      await handler(
        {
          RequestType: 'Update',
          ResourceProperties: {
            Description: logicalResourceId,
            scpName: 'mock-scp-name', //should throw an error since there will be no matching policy for this name
          },
        } as unknown as CloudFormationCustomResourceCreateEvent,
        {} as Context,
      );
    } catch (e) {
      expect(e).toMatchObject(new Error('No SCP Policy found for the name: mock-scp-name'));
    }
  });

  it('delete failed for scp when DetachPolicyCommand fails', async () => {
    organizationClientMock.on(ListRootsCommand).resolves({
      Roots: [
        {
          Id: rootAccountId,
          Name: rootAccountName,
        },
      ],
    });

    organizationClientMock.on(ListPoliciesCommand).resolves({
      Policies: [
        {
          Name: scpName,
          Id: policyId,
          Description: description,
        },
      ],
    });

    organizationClientMock.on(DetachPolicyCommand).rejects(new Error('PolicyNotAttachedException'));
    organizationClientMock.on(DeletePolicyCommand).resolves({});

    try {
      await handler(
        {
          RequestType: 'Delete',
          ResourceProperties: {
            scpName: scpName,
          },
        } as unknown as CloudFormationCustomResourceCreateEvent,
        {} as Context,
      );
    } catch (e) {
      expect(e).toMatchObject(new Error('PolicyNotAttachedException'));
    }
  });
});
