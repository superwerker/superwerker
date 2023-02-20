from dateutil.relativedelta import *
import boto3
import datetime
import json
import os

def handler(event, context):

    ce = boto3.client('ce')

    end = datetime.date.today().replace(day=1)
    start = end + relativedelta(months=-3)

    start = start.strftime("%Y-%m-%d")
    end = end.strftime("%Y-%m-%d")

    response = ce.get_cost_and_usage(
        Granularity='MONTHLY',
        Metrics=[
            'UnblendedCost',
        ],
        TimePeriod={
            'Start': start,
            'End': end,
        },
    )

    avg = 0

    for result in response['ResultsByTime']:
        total = result['Total']
        cost = total['UnblendedCost']
        amount = int(float(cost['Amount']))
        avg = avg + amount

    avg = int(avg/3)
    budget = str(avg)

    stack_name = os.environ['StackName']

    log({
        'average': avg,
        'budget': budget,
        'end': end,
        'event': event,
        'level': 'debug',
        'stack': stack_name,
        'start': start,
    })

    cf = boto3.client('cloudformation')

    cf.update_stack(
        Capabilities=[
            'CAPABILITY_IAM',
        ],
        Parameters=[
            {
                'ParameterKey': 'BudgetLimitInUSD',
                'ParameterValue': budget,
            }
        ],
        StackName=stack_name,
        UsePreviousTemplate=True,
    )

def log(msg):
    print(json.dumps(msg), flush=True)
