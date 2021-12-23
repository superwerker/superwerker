import boto3
import json
import os
from datetime import datetime
cw = boto3.client("cloudwatch")
ssm = boto3.client("ssm")

def handler(event, context):
  dns_domain =os.environ['SUPERWERKER_DOMAIN']
  superwerker_config = {}
  for ssm_parameter in ssm.get_parameters(Names=['/superwerker/domain_name_servers'])['Parameters']:
    superwerker_config[ssm_parameter['Name']] = ssm_parameter['Value']

  rootmail_ready_alarm_state = cw.describe_alarms(AlarmNames=['superwerker-RootMailReady'])['MetricAlarms'][0]['StateValue']
  if rootmail_ready_alarm_state == 'OK':
    dns_delegation_text = """
#### 🏠 {domain}
#### ✅ DNS configuration is set up correctly.
""".format(
  domain=dns_domain,
)
  else:
    if '/superwerker/domain_name_servers' in superwerker_config:
      dns_delegation_text = """
#### 🏠 {domain}
#### ❌ DNS configuration needed.

&nbsp;

### Next Steps

Please create the following NS records for your domain:

```
{ns[0]}
{ns[1]}
{ns[2]}
{ns[3]}
```
""".format(domain=dns_domain, ns=superwerker_config['/superwerker/domain_name_servers'].split(','))
    else:
      dns_delegation_text = '### DNS Setup pending'
  markdown = """
# [superwerker](https://github.com/superwerker/superwerker)
&nbsp;

{dns_delegation}

&nbsp;
## Next steps - finish setup
&nbsp;

### SSO Setup

- Check your e-mail inbox for "Invitation to join AWS Single Sign-On" and follow the setups to accept the invitation. After finishing, log in into AWS via the AWS SSO portal.
- [Configure AWS SSO with identity providers](https://docs.aws.amazon.com/singlesignon/latest/userguide/manage-your-identity-source-idp.html), e.g. [Azure AD](https://controltower.aws-management.tools/aa/sso/azure_ad/), [Google Workspace](https://controltower.aws-management.tools/aa/sso/google/), [Okta](https://controltower.aws-management.tools/aa/sso/okta/), [OneLogin](https://controltower.aws-management.tools/aa/sso/onelogin/), to login to AWS with your existing login mechanisms.

&nbsp;
### Organizations Setup

- Set up recommended organizational units via [Control Tower](/controltower/home/organizationunits?region={region}) acording to the [Organizing Your AWS Environment Using Multiple Accounts whitepaper](https://docs.aws.amazon.com/whitepapers/latest/organizing-your-aws-environment/production-starter-organization.html)
 - Create a `Workloads_Prod` organizational unit for production workloads
 - Create a `Workloads_Test` organizational unit for test/dev workloads

&nbsp;
## What now? Standard operating procedures

- Create AWS accounts for each of your workloads via the [Control Tower Account Factory](/controltower/home/accountfactory/createAccount?region={region}) (for "Account email" use `root+<random_suffix>@{dns_domain}`)
- Check [OpsCenter for incoming events and messages](/systems-manager/opsitems?region={region}#list_ops_items_filters=Status:Equal:Open_InProgress&activeTab=OPS_ITEMS)
- Check [AWS Security Hub](/securityhub/home?region={region}) for security best practise violations (login to Audit Account via AWS SSO portal first)
- Check [Amazon GuardDuty](/guardduty/home?region={region}#/findings) for threats against your AWS accounts (login to Audit Account via AWS SSO portal first)
- Exclude resources from being backed-up by changing the `superwerker:backup` tag to `none`

&nbsp;
## Help and more information

- [superwerker on GitHub](https://github.com/superwerker/superwerker)
- [Architecture Decision Records](https://github.com/superwerker/superwerker/tree/main/docs/adrs)
- [#superwerker](https://og-aws.slack.com/archives/C01CQ34TC93) Slack channel in [og-aws](http://slackhatesthe.cloud)
- [Mailing list](https://groups.google.com/forum/#!forum/superwerker/join)

&nbsp;

```
Updated at {current_time} (use browser reload to refresh)
```
  """.format(dns_delegation=dns_delegation_text, current_time=datetime.now(), region=os.environ['AWS_REGION'], dns_domain=dns_domain)
  cw.put_dashboard(
    DashboardName='superwerker',
    DashboardBody=json.dumps({"widgets": [{"type": "text","x": 0,"y": 0,"width": 24,"height": 20,"properties": {"markdown": markdown}}]}),
  )