import AWS from 'aws-sdk';
import endent from 'endent';

const ssm = new AWS.SSM();
const cloudwatch = new AWS.CloudWatch();

export async function handler(_event: any, _context: any) {
  const dnsDomain = process.env.SUPERWERKER_DOMAIN;
  const awsRegion = process.env.AWS_REGION;

  const dnsNames = await ssm
    .getParameter({
      Name: '/superwerker/domain_name_servers',
    })
    .promise();
  const dnsNamesArray = dnsNames.Parameter!.Value!.split(',');

  const isRootMailConfiguredBool = await isRootMailConfigured();

  const dnsDelegationText = createDnsDelegationText(isRootMailConfiguredBool, dnsDomain!, dnsNamesArray);
  const finalDashboardMessage = generateFinalDashboardMessage(dnsDelegationText, dnsDomain!, awsRegion!);
  const finalDashboardMessageEscaped = escape_string(finalDashboardMessage);

  await cloudwatch
    .putDashboard({
      DashboardName: 'superwerker',
      DashboardBody: `{"widgets": [{"type": "text","x": 0,"y": 0,"width": 24,"height": 20,"properties": {"markdown": "${finalDashboardMessageEscaped}"}}]}`,
    })
    .promise();
}

async function isRootMailConfigured() {
  const rootMailReadyAlarm = await cloudwatch
    .describeAlarms({
      AlarmNames: ['superwerker-RootMailReady'],
    })
    .promise();
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
  ## Finish setup
  &nbsp;

  ### SSO Setup

  - Check your e-mail inbox for \`Invitation to join AWS Single Sign-On\` and follow the setups to accept the invitation. After finishing, log in into AWS via the AWS SSO portal.
  - [Configure AWS SSO with identity providers](https://docs.aws.amazon.com/singlesignon/latest/userguide/manage-your-identity-source-idp.html), e.g. [Azure AD](https://controltower.aws-management.tools/aa/sso/azure_ad/), [Google Workspace](https://controltower.aws-management.tools/aa/sso/google/), [Okta](https://controltower.aws-management.tools/aa/sso/okta/), [OneLogin](https://controltower.aws-management.tools/aa/sso/onelogin/), to login to AWS with your existing login mechanisms.

  &nbsp;
  ### Landing Zone Accelerator (LZA)
  
  - In order to prevent locking yourself out of your AWS account in case SSO does not work the LZA version deploys two so called break glass IAM users
  - For finishing the setup please go to [IAM](/iam/home?region=${region}#/users) and set a new password & MFA for the users \`breakGlassUser01\` and \`breakGlassUser02\`

  &nbsp;
  ## GitOps Pipeline

  &nbsp;
  ### Control Tower Customizations (CfCT)

  - Control Tower Customizations include a [Git Repo](/codesuite/codecommit/repositories/custom-control-tower-configuration/browse?region=${region}) and a [Pipeline](/codesuite/codepipeline/pipelines/Custom-Control-Tower-CodePipeline/view?region=${region})
  - With the provided repo you can manage Stacksets and Service Control Policies (SCP), for more info visit the offical [AWS docs](https://docs.aws.amazon.com/controltower/latest/userguide/cfct-manifest-file-resources-section.html)
  - Please review the provided Stacksets & SCPs and adjust them to your needs

  - **Update Process**: Control Tower Customizations are provided as a seperate Stack so its lifecycle can be managed independently. For updating visit the offical [AWS docs](https://docs.aws.amazon.com/controltower/latest/userguide/update-stack.html)
  
  &nbsp;
  ### Landing Zone Accelerator (LZA)

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
    - CfCT: via the [Control Tower Account Factory](/controltower/home/accountfactory/createAccount?region=${region})
    - LZA: configured inside the LZA repo in the \`accounts-config.yaml\`
  - Check [OpsCenter for incoming events and messages](/systems-manager/opsitems?region=${region}#list_ops_items_filters=Status:Equal:Open_InProgress&activeTab=OPS_ITEMS)
  - Exclude resources from being backed-up by changing the \`superwerker:backup\` tag to \`none\`

  &nbsp;
  ## Help and more information

  - [superwerker on GitHub](https://github.com/superwerker/superwerker)
  - [Architecture Decision Records](https://github.com/superwerker/superwerker/tree/main/docs/adrs)
  - [#superwerker](https://og-aws.slack.com/archives/C01CQ34TC93) Slack channel in [og-aws](http://slackhatesthe.cloud)
  - [Mailing list](https://groups.google.com/forum/#!forum/superwerker/join)

  &nbsp;
  ## Switch GitOps Pipeline 

  - the LZA option rolls out the same features as CfCT but is more flexible and has more features on top
  - therefore it does not make sense to use both pipelines at the same time, trying to do so will result in errors due to duplicate resources
  - if you want to use one of the pipelines instead of the other please follow the steps below

  **Upgrade from CfCt to LZA**

  - Update the superwerker Cloudformation Stack and set \`Control Tower Customizations\` from \`Yes\` to \`No\` to uninstall the CfCT pipeline
  - Delete all resources (Stacksets & SCPs) created by the CfCT pipeline
  - Resources configured by the user like custom Stacksets and SCPs can be re-created in the LZA repo afterwards
  - Update the superwerker Cloudformation Stack and set \`Landingzone Accelerator\` from \`No\` to \`Yes\` to install the LZA pipeline

  **Downgrade from LZA to CfCT**

  - Update the superwerker Cloudformation Stack and set \`Landingzone Accelerator\` from \`Yes\` to \`No\` to uninstall the LZA pipeline
  - Delete all resources in all AWS accounts managed by the LZA, please follow the offical [AWS docs](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/uninstall-the-solution.html)
  - Update the superwerker Cloudformation Stack and set \`Control Tower Customizations\` from \`No\` to \`Yes\` to install the CfCT pipeline
  
  &nbsp;

  \`\`\`
  Updated at ${currentTime} (use browser reload to refresh)
  \`\`\`
  `;
}
