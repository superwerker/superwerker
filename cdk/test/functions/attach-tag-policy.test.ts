const spyOrganizationsAttachPolicy = jest.fn();
const spyOrganizationsCreatePolicy = jest.fn();
const spyOrganizationsDeletePolicy = jest.fn();
const spyOrganizationsDetachPolicy = jest.fn();
const spyOrganizationsListPoliciesForTarget = jest.fn();
const spyOrganizationsListRoots = jest.fn();
const spyOrganizationsUpdatePolicy = jest.fn();
const spyOrganizations = jest.fn(() => ({
  attachPolicy: spyOrganizationsAttachPolicy,
  createPolicy: spyOrganizationsCreatePolicy,
  deletePolicy: spyOrganizationsDeletePolicy,
  detachPolicy: spyOrganizationsDetachPolicy,
  listPoliciesForTarget: spyOrganizationsListPoliciesForTarget,
  listRoots: spyOrganizationsListRoots,
  updatePolicy: spyOrganizationsUpdatePolicy,
}));

jest.mock('aws-sdk', () => ({
  Organizations: spyOrganizations,
}));

import { ATTACH, handler, POLICY, policyAttached, rootId } from '../../src/functions/attach-tag-policy';

describe('attach tag policy', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('returns the right root id', async () => {
    const expectedRoot = {
      Id: 'test-ID',
      Arn: 'fake:arn',
      Name: 'Test Name',
    };
    spyOrganizationsListRoots.mockImplementation(() => ({
      promise() {
        return Promise.resolve({
          Roots: [
            expectedRoot,
          ],
        });
      },
    }));
    const actualRootId = await rootId();

    expect(actualRootId).toBe(expectedRoot.Id);
  });

  it.each([{
    policyId: 'existingId',
    success: true,
  }, {
    policyId: 'nonExistingId',
    success: false,
  }])('should return $success for $policyId', async ({
    policyId,
    success,
  }) => {
    const expectedRoot = {
      Id: 'rootId',
      Arn: 'fake:arn',
      Name: 'Test Name',
    };
    spyOrganizationsListRoots.mockImplementation(() => ({
      promise() {
        return Promise.resolve({
          Roots: [
            expectedRoot,
          ],
        });
      },
    }));
    const expectedPolicy = {
      Id: 'existingId',
    };
    spyOrganizationsListPoliciesForTarget.mockImplementation(() => ({
      promise() {
        return Promise.resolve({
          Policies: [expectedPolicy],
        });
      },
    }));

    const isPolicyAttached = await policyAttached(policyId);

    expect(isPolicyAttached).toBe(success);
  });

  it.each([{
    attach: true,
  }, {
    attach: false,
  }])('should create the policy and obey attach == $attach', async ({
    attach,
  }) => {
    const expectedRoot = {
      Id: 'rootId',
      Arn: 'fake:arn',
      Name: 'Test Name',
    };
    spyOrganizationsListRoots.mockImplementation(() => ({
      promise() {
        return Promise.resolve({
          Roots: [
            expectedRoot,
          ],
        });
      },
    }));
    const createdPolicy = {
      PolicySummary: {
        Id: 'existingId',
      },
    };
    spyOrganizationsCreatePolicy.mockImplementation(() => ({
      promise() {
        return Promise.resolve({
          Policy: createdPolicy,
        });
      },
    }));
    spyOrganizationsAttachPolicy.mockImplementation(() => ({
      promise() {
        return Promise.resolve({});
      },
    }));

    await handler({
      RequestType: 'Create',
      ResourceProperties: {
        [ATTACH]: attach,
        [POLICY]: 'some policy',
      },
      LogicalResourceId: 'logical resource id',
      PhysicalResourceId: 'physical resource id',
    }, {});

    expect(spyOrganizationsCreatePolicy).toHaveBeenCalledWith(
      expect.objectContaining({
        Content: 'some policy',
        Type: 'TAG_POLICY',
        Name: 'logical resource id',
      }),
    );

    if (attach) {
      expect(spyOrganizationsAttachPolicy).toHaveBeenCalledWith(
        expect.objectContaining({
          TargetId: expectedRoot.Id,
          PolicyId: createdPolicy.PolicySummary.Id,
        }),
      );
    }
  });

  it('should update the policy on Update', async () => {
    spyOrganizationsUpdatePolicy.mockImplementation(() => ({
      promise() {
        return Promise.resolve({});
      },
    }));

    await handler({
      RequestType: 'Update',
      ResourceProperties: {
        [POLICY]: 'some updated policy',
      },
      LogicalResourceId: 'logical resource id',
      PhysicalResourceId: 'physical resource id',
    }, {});

    expect(spyOrganizationsUpdatePolicy).toHaveBeenCalledWith(
      expect.objectContaining({
        PolicyId: 'physical resource id',
        Content: 'some updated policy',
        Name: 'logical resource id',
      }),
    );
  });

  it.each([{
    attached: true,
  }, {
    attached: false,
  }])('should detach (if attached == $attached) and delete the policy on Delete', async ({ attached }) => {
    const expectedRoot = {
      Id: 'rootId',
      Arn: 'fake:arn',
      Name: 'Test Name',
    };
    spyOrganizationsListRoots.mockImplementation(() => ({
      promise() {
        return Promise.resolve({
          Roots: [
            expectedRoot,
          ],
        });
      },
    }));
    spyOrganizationsDeletePolicy.mockImplementation(() => ({
      promise() {
        return Promise.resolve({});
      },
    }));
    spyOrganizationsDetachPolicy.mockImplementation(() => ({
      promise() {
        return Promise.resolve({});
      },
    }));

    spyOrganizationsListPoliciesForTarget.mockImplementation(() => ({
      promise() {
        return Promise.resolve({
          Policies: attached ? [{
            Id: 'p-hysicalresourceid',
          }] : [],
        });
      },
    }));

    await handler({
      RequestType: 'Delete',
      ResourceProperties: {
        [POLICY]: 'some updated policy',
      },
      LogicalResourceId: 'logical resource id',
      PhysicalResourceId: 'p-hysicalresourceid',
    }, {});

    if (attached) {
      expect(spyOrganizationsDetachPolicy).toHaveBeenCalledWith(
        expect.objectContaining({
          PolicyId: 'p-hysicalresourceid',
          TargetId: expectedRoot.Id,
        }),
      );
    } else {
      expect(spyOrganizationsDetachPolicy).not.toHaveBeenCalled();
    }
    expect(spyOrganizationsDeletePolicy).toHaveBeenCalledWith({
      PolicyId: 'p-hysicalresourceid',
    });
  });
});
