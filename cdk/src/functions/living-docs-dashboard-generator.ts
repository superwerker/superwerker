import { CloudWatchClient, PutDashboardCommand } from '@aws-sdk/client-cloudwatch';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import endent from 'endent';

const ssmClient = new SSMClient();
const cloudwatchClient = new CloudWatchClient({});

export async function handler(_event: any, _context: any) {
  const dnsDomain = process.env.SUPERWERKER_DOMAIN;
  const awsRegion = process.env.AWS_REGION;
  const hostedZoneParamName = process.env.HOSTEDZONE_PARAM_NAME;
  const propagationParamName = process.env.PROPAGATION_PARAM_NAME;

  const dnsNames = await ssmClient.send(
    new GetParameterCommand({
      Name: hostedZoneParamName,
    }),
  );
  const dnsNamesArray = dnsNames.Parameter!.Value!.split(',');

  const isRootMailConfiguredBool = await isRootMailConfigured(propagationParamName!);

  const dnsDelegationText = createDnsDelegationText(isRootMailConfiguredBool, dnsDomain!, dnsNamesArray);
  const finalDashboardMessage = generateFinalDashboardMessage(dnsDelegationText, dnsDomain!, awsRegion!);
  const finalDashboardMessageEscaped = escape_string(finalDashboardMessage);

  await cloudwatchClient.send(
    new PutDashboardCommand({
      DashboardName: 'superwerker',
      DashboardBody: `{"widgets": [{"type": "text","x": 0,"y": 0,"width": 24,"height": 20,"properties": {"markdown": "${finalDashboardMessageEscaped}"}}]}`,
    }),
  );
}

async function isRootMailConfigured(propagationParamName: string) {
  const ssmRes = await ssmClient.send(
    new GetParameterCommand({
      Name: propagationParamName,
    }),
  );
  return ssmRes.Parameter!.Value! === 'done';
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
  ## Next steps - finish setup
  &nbsp;

  ### SSO Setup

  - Check your e-mail inbox for \'Invitation to join AWS Single Sign-On\' and follow the setups to accept the invitation. After finishing, log in into AWS via the AWS SSO portal.
  - [Configure AWS SSO with identity providers](https://docs.aws.amazon.com/singlesignon/latest/userguide/manage-your-identity-source-idp.html), e.g. [Azure AD](https://docs.aws.amazon.com/singlesignon/latest/userguide/gs-ad.html), [Google Workspace](https://docs.aws.amazon.com/singlesignon/latest/userguide/gs-gwp.html), [Okta](https://docs.aws.amazon.com/singlesignon/latest/userguide/gs-okta.html), [OneLogin](https://docs.aws.amazon.com/singlesignon/latest/userguide/onelogin-idp.html), [CyberArk](https://docs.aws.amazon.com/singlesignon/latest/userguide/cyberark-idp.html), login to AWS with your existing login mechanisms.

  &nbsp;
  ### Organizations Setup

  - Set up recommended organizational units via [Control Tower](/controltower/home/organizationunits?region=${region}) acording to the [Organizing Your AWS Environment Using Multiple Accounts whitepaper](https://docs.aws.amazon.com/whitepapers/latest/organizing-your-aws-environment/production-starter-organization.html)
      - Create a \`Workloads_Prod\` organizational unit for production workloads
      - Create a \`Workloads_Test\` organizational unit for test/dev workloads

  &nbsp;
  ## What now? Standard operating procedures

  - Create AWS accounts for each of your workloads via the [Control Tower Account Factory](/controltower/home/accountfactory/createAccount?region=${region}) (for \'Account email\' use \`root+<random_suffix>@${dnsDomain}\`)
  - Check [OpsCenter for incoming events and messages](/systems-manager/opsitems?region=${region}#list_ops_items_filters=Status:Equal:Open_InProgress&activeTab=OPS_ITEMS)
  - Check [AWS Security Hub](/securityhub/home?region=${region}) for security best practise violations (login to Audit Account via AWS SSO portal first)
  - Check [Amazon GuardDuty](/guardduty/home?region=${region}#/findings) for threats against your AWS accounts (login to Audit Account via AWS SSO portal first)
  - Exclude resources from being backed-up by changing the \`superwerker:backup\` tag to \`none\`

  &nbsp;
  ## Help and more information

  - [superwerker on GitHub](https://github.com/superwerker/superwerker)
  - [Architecture Decision Records](https://github.com/superwerker/superwerker/tree/main/docs/adrs)
  - [#superwerker](https://og-aws.slack.com/archives/C01CQ34TC93) Slack channel in [og-aws](http://slackhatesthe.cloud)

  &nbsp;

  \`\`\`
  Updated at ${currentTime} (use browser reload to refresh)
  \`\`\`
  `;
}
