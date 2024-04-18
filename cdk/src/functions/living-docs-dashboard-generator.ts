import { CloudWatchClient, DeleteDashboardsCommand } from '@aws-sdk/client-cloudwatch';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import endent from 'endent';

const ssmClient = new SSMClient();
const cloudwatchClient = new CloudWatchClient({});

const DOCS = `
## DNS Configuration and Next Steps
Will fetch the current DNS configuration for the domain and display it in a widget.
Additonally, some information regarding the next steps to finish the setup will be displayed.

### Widget parameters
No parameters required
\`\`\`
`;

export interface WidgetContent {
  markdown: string;
}

export async function handler(event: any, _context: any): Promise<string | WidgetContent> {
  if (event.describe) {
    return DOCS;
  }

  const dnsDomain = process.env.SUPERWERKER_DOMAIN;
  const awsRegion = process.env.AWS_REGION;
  const hostedZoneParamName = process.env.HOSTEDZONE_PARAM_NAME;
  const propagationParamName = process.env.PROPAGATION_PARAM_NAME;

  //fire and forget: delete legacy 'superwerker' dashboard if it exists
  void deleteLegacyDashboard();

  const [dnsNames, isRootMailConfiguredBool] = await Promise.all([
    ssmClient.send(
      new GetParameterCommand({
        Name: hostedZoneParamName,
      }),
    ),
    isRootMailConfigured(propagationParamName!),
  ]);

  const dnsNamesArray = dnsNames.Parameter!.Value!.split(',');

  const dnsDelegationText = createDnsDelegationText(isRootMailConfiguredBool, dnsDomain!, dnsNamesArray);
  const widgetContent = generateWidgetContent(dnsDelegationText, dnsDomain!, awsRegion!);

  return { markdown: widgetContent } as WidgetContent;
}

async function isRootMailConfigured(propagationParamName: string): Promise<boolean> {
  const ssmRes = await ssmClient.send(
    new GetParameterCommand({
      Name: propagationParamName,
    }),
  );
  return ssmRes.Parameter!.Value! === 'done';
}

export function createDnsDelegationText(isRootMailConfiguredBool: boolean, dnsDomain: string, dnsNames: string[]): string {
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

function generateSuccesfulDnsConfigurationMessage(dnsDomain: string): string {
  return endent`
    #### 🏠 ${dnsDomain}
    #### ✅ DNS configuration is set up correctly.`;
}

function generateDnsConfigurationRequiredMessage(dnsDomain: string, ns: string[]): string {
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

export function generateWidgetContent(dnsDelegationText: string, dnsDomain: string, region: string): string {
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

  \`\`\`
  Updated at ${currentTime}
  \`\`\`
  `;
}

async function deleteLegacyDashboard(): Promise<void> {
  cloudwatchClient
    .send(
      new DeleteDashboardsCommand({
        DashboardNames: ['superwerker'],
      }),
    )
    .then((response) => console.log('Successfully deleted legacy superwerker dashboard', response))
    .catch((error) => console.log('Could not delete legacy superwerker dashboard', error));
}
