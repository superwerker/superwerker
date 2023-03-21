const spyCloudFormationUpdateStack = jest.fn();
const spyCloudFormation = jest.fn(() => ({ updateStack: spyCloudFormationUpdateStack }));

const spyCostExplorerGetCostAndUsage = jest.fn();
const spyCostExplorer = jest.fn(() => ({
  getCostAndUsage: spyCostExplorerGetCostAndUsage,
}));

jest.mock('aws-sdk', () => ({
  CloudFormation: spyCloudFormation,
  CostExplorer: spyCostExplorer,
}));

const usageReportResponse = {
  ResultsByTime: [
    {
      Total: {
        UnblendedCost: {
          Amount: '30.0',
        },
      },
    },
    {
      Total: {
        UnblendedCost: {
          Amount: '20.0',
        },
      },
    },
    {
      Total: {
        UnblendedCost: {
          Amount: '16.0',
        },
      },
    },
  ]
};


const usageReportResponseBelowTenAverage = {
  ResultsByTime: [
    {
      Total: {
        UnblendedCost: {
          Amount: '3.0',
        },
      },
    },
    {
      Total: {
        UnblendedCost: {
          Amount: '4.0',
        },
      },
    },
    {
      Total: {
        UnblendedCost: {
          Amount: '2.0',
        },
      },
    },
  ]
};

import { handler, extractAverageCostInUSD } from '../../src/functions/budget-updater';

describe('budget-updater handler', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    process.env.STACK_NAME = 'example-stack';
  });

  afterEach(() => {
    delete process.env.STACK_NAME;
  });

  it('update budget', async () => {

    spyCostExplorerGetCostAndUsage.mockImplementation(() => ({
      promise() {
        return usageReportResponse;
      },
    }));

    spyCloudFormationUpdateStack.mockImplementation(() => ({
      promise() {
        return Promise.resolve();
      },
    }));

    const event = {};

    await handler(
      event,
      {},
    );

    expect(spyCostExplorerGetCostAndUsage).toHaveBeenCalledTimes(1);
    expect(spyCostExplorerGetCostAndUsage).toHaveBeenNthCalledWith(1, {
      TimePeriod: {
        Start: expect.any(String),
        End: expect.any(String),
      },
      Granularity: 'MONTHLY',
      Metrics: ['UnblendedCost'],
    });

    expect(spyCloudFormationUpdateStack).toHaveBeenCalledTimes(1);
    expect(spyCloudFormationUpdateStack).toHaveBeenNthCalledWith(1, {
      StackName: process.env.STACK_NAME,
      UsePreviousTemplate: true,
      Capabilities: ['CAPABILITY_NAMED_IAM'],
      Parameters: [
        {
          ParameterKey: 'BudgetLimitInUSD',
          ParameterValue: '22',
        },
      ],
    });

  });
});

describe('calculateAverageCost', () => {

  it('check calulation', () => {

    const result = extractAverageCostInUSD(usageReportResponse);
    expect(result).toEqual(22);

  });

  it('check calulation low average', () => {

    const result = extractAverageCostInUSD(usageReportResponseBelowTenAverage);
    expect(result).toEqual(10);

  });

});