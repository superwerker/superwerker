import AWS from 'aws-sdk';
import { GetCostAndUsageResponse } from 'aws-sdk/clients/costexplorer';

const ce = new AWS.CostExplorer({ region: 'us-east-1' });
const cfn = new AWS.CloudFormation();

export async function handler(_event: any, _context: any) {

  const stackName = process.env.STACK_NAME;

  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const firstDayOfMonthThreeMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 3, 1);

  // format date to YYYY-MM-DD
  const firstDayOfMonthString = firstDayOfMonth.toISOString().split('T')[0];
  const firstDayOfMonthThreeMonthsAgoString = firstDayOfMonthThreeMonthsAgo.toISOString().split('T')[0];

  const costResponse = await ce.getCostAndUsage({
    TimePeriod: {
      Start: firstDayOfMonthThreeMonthsAgoString,
      End: firstDayOfMonthString,
    },
    Granularity: 'MONTHLY',
    Metrics: ['UnblendedCost'],
  }).promise();

  const averageCost = extractAverageCostInUSD(costResponse).toString();

  await cfn.updateStack({
    StackName: stackName!,
    UsePreviousTemplate: true,
    Capabilities: ['CAPABILITY_NAMED_IAM'],
    Parameters: [
      {
        ParameterKey: 'BudgetLimitInUSD',
        ParameterValue: averageCost,
      },
    ],
  }).promise();

}

export function extractAverageCostInUSD(response: Pick<GetCostAndUsageResponse, 'ResultsByTime'>) {
  let totalCost = 0;

  response.ResultsByTime!.forEach(time => {
    const total = time.Total!;
    const cost = total.UnblendedCost!;
    const amount = cost.Amount!;
    totalCost += parseFloat(amount);
  });

  let averageCost = totalCost / 3;
  console.log(`Average cost for the last 3 months: ${averageCost}`);

  // budget limit cannot be lower than 10 USD
  if (averageCost < 10) {
    averageCost = 10;
  }
  return averageCost;
}