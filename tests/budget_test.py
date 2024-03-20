import boto3
import pytest
from retrying import retry

budget = boto3.client('budgets')
cw_client=boto3.client('cloudwatch')
ssm = boto3.client('ssm')
sts = boto3.client('sts')

@pytest.fixture
def update_budget_threshold(management_account_id):
    base_budget= budget.describe_budgets(AccountId=management_account_id)['Budgets'][0]
    current_budget = base_budget.copy()
    current_budget['BudgetLimit']['Amount'] = '0.90'
    del current_budget['AutoAdjustData']

    budget.update_budget(
        AccountId=management_account_id,
        NewBudget = current_budget
    )
    return base_budget

@pytest.fixture
def prepare_budget(update_budget_threshold, management_account_id):
    yield update_budget_threshold
    del update_budget_threshold['BudgetLimit']
    del update_budget_threshold['AutoAdjustData']['LastAutoAdjustTime']
    del update_budget_threshold['AutoAdjustData']['HistoricalOptions']['LookBackAvailablePeriods']
    budget.update_budget(
        AccountId=management_account_id,
        NewBudget = update_budget_threshold
    )

@pytest.fixture
def update_cw_alarm():
    base_alarm = cw_client.describe_alarms(
        AlarmNamePrefix = 'BudgetStack'
    )['MetricAlarms'][0]

    del base_alarm['AlarmArn']
    del base_alarm['AlarmConfigurationUpdatedTimestamp']
    del base_alarm['StateValue']
    del base_alarm['StateReason']
    del base_alarm['StateReasonData']
    del base_alarm['StateUpdatedTimestamp']
    del base_alarm['StateTransitionedTimestamp']

    current_alarm=base_alarm.copy()
    current_alarm['Period'] = 10
    cw_client.put_metric_alarm(**current_alarm)

    return base_alarm
    
@pytest.fixture
def prepare_alarm(update_cw_alarm):
    yield update_cw_alarm
    cw_client.put_metric_alarm(**update_cw_alarm)
    
@pytest.fixture(scope="module")
def management_account_id():
    return sts.get_caller_identity()['Account']

def test_budget(prepare_budget, prepare_alarm):
    assert prepare_budget
    get_ops_item_by_title("Cloudwatch alarm - 'Budget")

@retry(wait_exponential_multiplier=1000, wait_exponential_max=10000, stop_max_delay=60000)
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