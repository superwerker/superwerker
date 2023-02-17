const spyOrganizationsEnablePolicyType = jest.fn();
const spyOrganizationsListRoots = jest.fn();
const spyOrganizations = jest.fn(() => ({
  enablePolicyType: spyOrganizationsEnablePolicyType,
  listRoots: spyOrganizationsListRoots,
}));

jest.mock('aws-sdk', () => ({
  Organizations: spyOrganizations,
}));

import { getRootId, enableServiceControlPolicies, SCP } from '../../src/functions/enable-scp';

describe('enable SCPs', () => {
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
    const actualRootId = await getRootId();

    expect(actualRootId).toBe(expectedRoot.Id);
  });

  it('should enable SCPs if not already enabled', async () => {
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
    spyOrganizationsEnablePolicyType.mockImplementation(() => ({
      promise() {
        return Promise.resolve();
      },
    }));

    await enableServiceControlPolicies({
      RequestType: 'Create',
    }, {});
    expect( spyOrganizationsEnablePolicyType).toHaveBeenCalledWith({
      RootId: expectedRoot.Id,
      PolicyType: SCP,
    });
  });

  it('should not enable SCPs if already enabled', async () => {
    const expectedRoot = {
      Id: 'rootId',
      Arn: 'fake:arn',
      Name: 'Test Name',
      PolicyTypes: [{
        Type: SCP,
        Status: 'ENABLED',
      }],
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
    spyOrganizationsEnablePolicyType.mockImplementation(() => ({
      promise() {
        return Promise.resolve();
      },
    }));

    await enableServiceControlPolicies({
      RequestType: 'Create',
    }, {});
    expect( spyOrganizationsEnablePolicyType).not.toHaveBeenCalled();
  });
});
