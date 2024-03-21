import boto3
import pytest
from retrying import retry

budget = boto3.client('budgets')
cw_client=boto3.client('cloudwatch')
ssm = boto3.client('ssm')
sts = boto3.client('sts')

@pytest.fixture
def update_cw_alarm():
    base_alarm = cw_client.describe_alarms(
        AlarmNamePrefix = 'BudgetStack'
    )['MetricAlarms'][0]
    cw_client.set_alarm_state(
        AlarmName=base_alarm['AlarmName'],
        StateValue='ALARM',
        StateReason='Testing',
    )
    return base_alarm
    
@pytest.fixture
def prepare_alarm(update_cw_alarm):
    yield update_cw_alarm
    cw_client.set_alarm_state(
        AlarmName=update_cw_alarm['AlarmName'],
        StateValue='OK',
        StateReason='Testing',
    )
    ssm.delete_ops_item(OpsItemId=get_ops_item_by_title("Cloudwatch alarm - 'Budget")['Entities'][0]['Id'])
    
@pytest.fixture(scope="module")
def management_account_id():
    return sts.get_caller_identity()['Account']

def test_budget(prepare_alarm):
    get_ops_item_by_title("Cloudwatch alarm - 'Budget")

def test_alarms():
    cw_alarm = cw_client.describe_alarms(AlarmNamePrefix = 'BudgetStack')['MetricAlarms'][0]
    assert cw_alarm['ActionsEnabled'], 'Actions are not enabled'
    assert cw_alarm['MetricName'] == 'NumberOfMessagesPublished', 'Metric Name is incorrect'
    assert cw_alarm['Threshold'] == 0, 'Check Threshold'

def test_budget_alarm(management_account_id):
    budget_alarm= budget.describe_budgets(AccountId=management_account_id)['Budgets'][0]
    assert budget_alarm['AutoAdjustData']['AutoAdjustType'] == 'HISTORICAL', 'Auto Adjust Data is not set correctly to HISTORICAL'
    assert budget_alarm['AutoAdjustData']['HistoricalOptions']['BudgetAdjustmentPeriod'] == 1 , 'Budget Adjustment Period is incorrect'

@retry(wait_exponential_multiplier=1000, wait_exponential_max=10000, stop_max_delay=10000)
def get_ops_item_by_title(title):
    res = ssm.get_ops_summary(
        Filters=[
            {
                'Key': 'AWS:OpsItem.Title',
                'Values': [
                    title
                ],
                'Type': 'BeginWith',
            },
            {
                'Key': 'AWS:OpsItem.Status',
                'Values': [
                    'Open'
                ],
                'Type': 'Equal',
            },
        ],
    )

    if len(res['Entities']) == 0:
        raise  # mail has probably not arrived yet
    return res