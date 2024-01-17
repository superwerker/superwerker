import { CloudWatchClient, DescribeAlarmsCommand, PutDashboardCommand } from '@aws-sdk/client-cloudwatch';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import endent from 'endent';

const ssmClient = new SSMClient();
const cloudwatchClient = new CloudWatchClient({});


export async function handler(_event: any, _context: any) {
  const dnsDomain = process.env.SUPERWERKER_DOMAIN;
  const awsRegion = process.env.AWS_REGION;

  const dnsNames = await ssmClient.send(new GetParameterCommand({
    Name: '/superwerker/domain_name_servers',
  }));
  const dnsNamesArray = dnsNames.Parameter!.Value!.split(',');

  const isRootMailConfiguredBool = await isRootMailConfigured();

  const dnsDelegationText = createDnsDelegationText(isRootMailConfiguredBool, dnsDomain!, dnsNamesArray);
  const finalDashboardMessage = generateFinalDashboardMessage(dnsDelegationText, dnsDomain!, awsRegion!);
  const finalDashboardMessageEscaped = escape_string(finalDashboardMessage);

  await cloudwatchClient.send(new PutDashboardCommand({
    DashboardName: 'superwerker',
    DashboardBody: `{"widgets": [{"type": "text","x": 0,"y": 0,"width": 24,"height": 20,"properties": {"markdown": "${finalDashboardMessageEscaped}"}}]}`,
  }));
}

async function isRootMailConfigured() {
  const rootMailReadyAlarm = await cloudwatchClient.send(new DescribeAlarmsCommand({
    AlarmNames: [
      'superwerker-RootMailReady',
    ],
  }));
  return rootMailReadyAlarm.MetricAlarms![0].StateValue === 'OK';
}

export function createDnsDelegationText(isRootMailConfiguredBool: boolean, dnsDomain: string, dnsNames: string[]) {
  let dnsDelegationText = '';
  if (isRootMailConfiguredBool) {
    dnsDelegationText = generateSuccesfulDnsConfigurationMessage(dnsDomain!);
  } else {
    if (dnsNames.length > 0) {
      dnsDelegationText = generateDnsConfigurationRequiredMessage(dnsDomain!, dnsNames);
    } else {
      dnsDelegationText = '### DNS Setup pending';
    }
  }
  return dnsDelegationText;
}

function escape_string(input: string) {
  return input
    .replace(/[\\]/g, '\\\\')
    .replace(/[\"]/g, '\\"')
    .replace(/[\/]/g, '\\/')
    .replace(/[\b]/g, '\\b')
    .replace(/[\f]/g, '\\f')
    .replace(/[\n]/g, '\\n')
    .replace(/[\r]/g, '\\r')
    .replace(/[\t]/g, '\\t')
    .replace(/[\u0000-\u0019]+/g, '');
}

function generateSuccesfulDnsConfigurationMessage(dnsDomain: string) {
  return endent`
    #### 🏠 ${dnsDomain}
    #### ✅ DNS configuration is set up correctly.`;
}

function generateDnsConfigurationRequiredMessage(dnsDomain: string, ns: string[]) {
  return endent`
    #### 🏠 ${dnsDomain}
    #### ❌ DNS configuration needed.

    &nbsp;

    ### Next Steps

    Please create the following NS records for your domain:

    \`\`\`
    ${ns[0]}
    ${ns[1]}
    ${ns[2]}
    ${ns[3]}
    \`\`\`
    `;
}

export function generateFinalDashboardMessage(dnsDelegationText: string, dnsDomain: string, region: string) {
  const currentTime = new Date();
  return endent`
  # [superwerker](https://github.com/superwerker/superwerker)
  &nbsp;

  ${dnsDelegationText}

  &nbsp;
  ## Finish basic setup

  &nbsp;
  ### Single Sign-On (SSO)

  - Check your e-mail inbox for \`Invitation to join AWS Single Sign-On\` and follow the setups to accept the invitation. After finishing, log in into AWS via the AWS SSO portal.
  - [Configure AWS SSO with identity providers](https://docs.aws.amazon.com/singlesignon/latest/userguide/manage-your-identity-source-idp.html), e.g. [Azure AD](https://controltower.aws-management.tools/aa/sso/azure_ad/), [Google Workspace](https://controltower.aws-management.tools/aa/sso/google/), [Okta](https://controltower.aws-management.tools/aa/sso/okta/), [OneLogin](https://controltower.aws-management.tools/aa/sso/onelogin/), to login to AWS with your existing login mechanisms.

  &nbsp;
  ## Finish advanced setup

  &nbsp;
  ### Break Glass Users
  
  - In order to prevent locking yourself out of your AWS account in case SSO does not work the LZA version deploys two so called break glass IAM users
  - For finishing the setup please go to [IAM](/iam/home?region=${region}#/users) and set a new password & MFA for the users \`breakGlassUser01\` and \`breakGlassUser02\`

  &nbsp;
  ## Features

  &nbsp;
  ### Basic

  &nbsp;
  ### Advanced

  - The LZA includes a [Git Repo](/codesuite/codecommit/repositories/aws-accelerator-config/browse?region=${region}) and a [Pipeline](/codesuite/codepipeline/pipelines/AWSAccelerator-Pipeline/view?region=${region})
  - With the provided repo you can manage your whole landingzone in a GitOps style, for more configuration options visit the offical [AWS repo](https://github.com/awslabs/landing-zone-accelerator-on-aws)
  - Please review the provided configurations and adjust them to your needs

  - **Securiy Services**:
    - Check [AWS Security Hub](/securityhub/home?region=${region}) for security best practise violations (login to Audit Account via AWS SSO portal first)
    - Check [Amazon GuardDuty](/guardduty/home?region=${region}#/findings) for threats against your AWS accounts (login to Audit Account via AWS SSO portal first)
    
  - **Operational tasks**: please see the offical docs for common [admin tasks](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/performing-administrator-tasks.html)

  - **Update process**: the LZA is provided as a seperate stack so its lifecycle can be managed independently. For updating visit the offical [AWS docs](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/update-the-solution.html)

  &nbsp;
  ## What now? Standard operating procedures

  - Create AWS accounts for each of your workloads (as email use \`root+<random_suffix>@${dnsDomain}\`)
    - Basic: via the [Control Tower Account Factory](/controltower/home/accountfactory/createAccount?region=${region})
    - Advanced: configured inside the LZA repo in the \`accounts-config.yaml\`
  - Check [OpsCenter for incoming events and messages](/systems-manager/opsitems?region=${region}#list_ops_items_filters=Status:Equal:Open_InProgress&activeTab=OPS_ITEMS)
  - Exclude resources from being backed-up by changing the \`superwerker:backup\` tag to \`none\`

  &nbsp;
  ## Help and more information

  - [superwerker on GitHub](https://github.com/superwerker/superwerker)
  - [Architecture Decision Records](https://github.com/superwerker/superwerker/tree/main/docs/adrs)
  - [#superwerker](https://og-aws.slack.com/archives/C01CQ34TC93) Slack channel in [og-aws](http://slackhatesthe.cloud)
  - [Mailing list](https://groups.google.com/forum/#!forum/superwerker/join)


  &nbsp;

  \`\`\`
  Updated at ${currentTime} (use browser reload to refresh)
  \`\`\`
  `;
}
