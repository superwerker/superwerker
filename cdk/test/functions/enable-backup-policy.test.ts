const spyOrganizationsEnablePolicyType = jest.fn();
const spyOrganizationsListRoots = jest.fn();
const spyOrganizations = jest.fn(() => ({
  enablePolicyType: spyOrganizationsEnablePolicyType,
  listRoots: spyOrganizationsListRoots,
}));

jest.mock('aws-sdk', () => ({
  Organizations: spyOrganizations,
}));

import { handler, rootId } from '../../src/functions/enable-backup-policy';

describe('enable tag policy', () => {
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
    shouldEnable: true,
    requestType: 'Create',
  }, {
    shouldEnable: false,
    requestType: 'Create',
  }])('should disable if policy type attached == $shouldEnable', async ({
    shouldEnable,
  }) => {
    const expectedRoot = {
      Id: 'rootId',
      Arn: 'fake:arn',
      Name: 'Test Name',
      PolicyTypes: shouldEnable ? [] : [
        { Type: 'BACKUP_POLICY', Status: 'ENABLED' },
      ],
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
        return Promise.resolve({});
      },
    }));

    await handler({
      RequestType: 'Create',
    }, {});

    if (shouldEnable) {
      expect(spyOrganizationsEnablePolicyType).toHaveBeenCalledWith({
        RootId: expectedRoot.Id,
        PolicyType: 'BACKUP_POLICY',
      });
    } else {
      expect(spyOrganizationsEnablePolicyType).not.toHaveBeenCalled();
    }
  });

});

