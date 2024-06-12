import {
  AttachPolicyCommand,
  CreatePolicyCommand,
  DeletePolicyCommand,
  DetachPolicyCommand,
  ListPoliciesCommand,
  ListRootsCommand,
  OrganizationsClient,
  PolicyType,
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
const scpPolicy = '{"Version": "2012-10-17", "Statement": [/* policy document */]}';
const updatedSCPPolicy = '{"Version": "2012-10-17", "Statement": [/* UPDATED policy document */]}';
const description = 'superwerker - SCPRoot';

describe('service_control_policies', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    organizationClientMock.reset();
    process.env.AWS_REGION = 'us-east-1';
  });

  afterEach(() => {
    delete process.env.AWS_REGION;
  });

  it('service_control_policy_create', async () => {
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
          Type: PolicyType.SERVICE_CONTROL_POLICY,
          Description: logicalResourceId,
          Name: scpName,
          Content: scpPolicy,
        },
      } as unknown as CloudFormationCustomResourceCreateEvent,
      {} as Context,
    );

    expect(response).toMatchObject({ SUCCESS: 'SCPs have been successfully created for Root account' });
  });

  it('service_control_policy_create_failed', async () => {
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

    //organizationClientMock.on(AttachPolicyCommand).resolves({});

    try {
      await handler(
        {
          RequestType: 'Create',
          ResourceProperties: {
            Type: PolicyType.SERVICE_CONTROL_POLICY,
            Description: logicalResourceId,
            Name: scpName,
            Content: scpPolicy,
          },
        } as unknown as CloudFormationCustomResourceCreateEvent,
        {} as Context,
      );
    } catch (e) {
      expect(e).toBeInstanceOf(TypeError);
      //toMatchObject(new Error('No root account found in the organization'));
    }
  });

  it('service_control_policy_update', async () => {
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
          Type: PolicyType.SERVICE_CONTROL_POLICY,
          Description: logicalResourceId,
          scpName: scpName,
          Content: updatedSCPPolicy,
        },
      } as unknown as CloudFormationCustomResourceCreateEvent,
      {} as Context,
    );

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

  it('no root account found in organization', async () => {
    organizationClientMock.on(ListRootsCommand).resolves({
      Roots: [],
    });

    try {
      await handler(
        {
          RequestType: 'Create',
          ResourceProperties: {
            Type: PolicyType.SERVICE_CONTROL_POLICY,
            Description: logicalResourceId,
            scpName: scpName,
            Content: updatedSCPPolicy,
          },
        } as unknown as CloudFormationCustomResourceCreateEvent,
        {} as Context,
      );
    } catch (e) {
      expect(e).toMatchObject(new Error('No root account found in the organization'));
    }
  });

  it('no SCP policy found in organization error', async () => {
    //Should throw an error when there are no SCP policies in the organization
    organizationClientMock.on(ListPoliciesCommand).resolves({
      Policies: [],
    });

    try {
      await handler(
        {
          RequestType: 'Update',
          ResourceProperties: {
            Type: PolicyType.SERVICE_CONTROL_POLICY,
            Description: logicalResourceId,
            scpName: scpName,
            Content: updatedSCPPolicy,
          },
        } as unknown as CloudFormationCustomResourceCreateEvent,
        {} as Context,
      );
    } catch (e) {
      expect(e).toMatchObject(new Error('No SCP Policy found in the organization'));
    }
  });

  it('no matching policy found error', async () => {
    //Should throw an error when there are no policies matching the name
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
            Type: PolicyType.SERVICE_CONTROL_POLICY,
            Description: logicalResourceId,
            scpName: 'mock-scp-name', //should throw an error since there will be no matching policy for this name
            Content: updatedSCPPolicy,
          },
        } as unknown as CloudFormationCustomResourceCreateEvent,
        {} as Context,
      );
    } catch (e) {
      expect(e).toMatchObject(new Error('No SCP Policy found for the name: mock-scp-name'));
    }
  });

  it('service_control_policy_delete', async () => {
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

    organizationClientMock.on(DetachPolicyCommand).resolves({});
    organizationClientMock.on(DeletePolicyCommand).resolves({});

    const response = await handler(
      {
        RequestType: 'Delete',
        ResourceProperties: {
          Id: logicalResourceId,
          scpName: scpName,
        },
      } as unknown as CloudFormationCustomResourceCreateEvent,
      {} as Context,
    );

    expect(response).toBeTruthy();
  });
  it('service_control_policy_delete_failed', async () => {
    organizationClientMock.on(ListRootsCommand).resolves({});

    organizationClientMock.on(ListPoliciesCommand).resolves({
      Policies: [
        {
          Name: scpName,
          Id: logicalResourceId,
          Description: description,
        },
      ],
    });

    //organizationClientMock.on(DetachPolicyCommand).resolves({});
    organizationClientMock.on(DeletePolicyCommand).resolves({});

    try {
      await handler(
        {
          RequestType: 'Delete',
          ResourceProperties: {
            Id: logicalResourceId,
          },
        } as unknown as CloudFormationCustomResourceCreateEvent,
        {} as Context,
      );
    } catch (e) {
      expect(e).toMatchObject(new Error('No root account found in the organization'));
    }
  });
});
