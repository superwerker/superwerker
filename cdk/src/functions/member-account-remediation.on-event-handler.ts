import {
  EC2Client,
  EnableEbsEncryptionByDefaultCommand,
  DescribeVpcsCommand,
  DescribeInternetGatewaysCommand,
  DetachInternetGatewayCommand,
  DeleteInternetGatewayCommand,
  DeleteVpcCommand,
  DescribeSubnetsCommand,
  DeleteSubnetCommand,
  DescribeSecurityGroupsCommand,
  DeleteSecurityGroupCommand,
  DescribeRouteTablesCommand,
  DeleteRouteCommand,
  DescribeNetworkAclsCommand,
  DeleteNetworkAclCommand,
} from '@aws-sdk/client-ec2';
import { IAMClient, UpdateAccountPasswordPolicyCommand } from '@aws-sdk/client-iam';
import { S3ControlClient, PutPublicAccessBlockCommand } from '@aws-sdk/client-s3-control';
import { STS } from '@aws-sdk/client-sts';
import { CdkCustomResourceEvent, CloudFormationCustomResourceUpdateEvent, CdkCustomResourceResponse, Context } from 'aws-lambda';
import { getCredsFromAssumeRole } from './utils/assume-role';
import { throttlingBackOff } from './utils/throttle';

export async function handler(event: CdkCustomResourceEvent, _context: Context): Promise<CdkCustomResourceResponse> {
  //const region = event.ResourceProperties['region'];
  const homeRegion = process.env.homeRegion!;
  const loggingAccountId = process.env.loggingAccountId!;
  const auditAccountId = process.env.auditAccountId!;
  const crossAccountRoleName = process.env.crossAccountRoleName!;

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      let physicalResourceId = (event as CloudFormationCustomResourceUpdateEvent).PhysicalResourceId;
      if (event.RequestType === 'Create') {
        physicalResourceId = 'securityhub-member-remediations';
      }

      await remediationActions(loggingAccountId, crossAccountRoleName, homeRegion);
      await remediationActions(auditAccountId, crossAccountRoleName, homeRegion);

      return {
        PhysicalResourceId: physicalResourceId,
      };
    case 'Delete':
      console.log('Do nothing');

      return {
        PhysicalResourceId: event.PhysicalResourceId,
      };
  }
}

async function remediationActions(accountId: string, roleName: string, region: string) {
  const crossAccountRoleArn = `arn:aws:iam::${accountId}:role/${roleName}`;

  const stsClient = new STS();
  const creds = await getCredsFromAssumeRole(stsClient, crossAccountRoleArn, 'SecurityHubRemediations');
  const IAM = new IAMClient({ credentials: creds, region: region });
  const EC2 = new EC2Client({ credentials: creds, region: region });
  const s3ControlClient = new S3ControlClient({ credentials: creds, region: region });

  // Update IAM policy
  // TODO : add SCP to deny update account policy by member accounts
  await updatePasswordPolicy(IAM).catch((e) => console.log(e));

  // Set EBS default encryption
  await EC2.send(
    new EnableEbsEncryptionByDefaultCommand({
      DryRun: false,
    }),
  ).catch((e) => console.log(e));

  await deleteDefaultVPC(EC2).catch((e) => console.log(e));

  console.log('Setting S3 Public Access block');
  await throttlingBackOff(() =>
    s3ControlClient.send(
      new PutPublicAccessBlockCommand({
        AccountId: accountId,
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
      }),
    ),
  );
}

async function updatePasswordPolicy(IAM: IAMClient) {
  await IAM.send(
    new UpdateAccountPasswordPolicyCommand({
      MinimumPasswordLength: 8,
      RequireSymbols: true,
      RequireNumbers: true,
      RequireUppercaseCharacters: true,
      RequireLowercaseCharacters: true,
      AllowUsersToChangePassword: true,
      MaxPasswordAge: 90,
      PasswordReusePrevention: 24,
      HardExpiry: false,
    }),
  );
}

async function deleteDefaultVPC(EC2: EC2Client) {
  const defaultVpcIds: string[] = [];

  // Retrieve default VPC(s)
  let describeVpcsNextToken: string | undefined = undefined;
  do {
    const page = await throttlingBackOff(() =>
      EC2.send(
        new DescribeVpcsCommand({
          Filters: [{ Name: 'is-default', Values: ['true'] }],
          NextToken: describeVpcsNextToken,
        }),
      ),
    );

    for (const vpc of page.Vpcs ?? []) {
      if (vpc.VpcId) {
        defaultVpcIds.push(vpc.VpcId);
      }
    }
    describeVpcsNextToken = page.NextToken;
  } while (describeVpcsNextToken);

  console.log('List of VPCs: ', defaultVpcIds);
  if (defaultVpcIds.length == 0) {
    console.warn('No default VPCs detected');
    return;
  } else {
    console.warn('Default VPC Detected');
  }

  // Retrieve and detach, delete IGWs
  for (const vpcId of defaultVpcIds) {
    let nextToken: string | undefined = undefined;
    do {
      const page = await throttlingBackOff(() =>
        EC2.send(
          new DescribeInternetGatewaysCommand({
            Filters: [{ Name: 'attachment.vpc-id', Values: [vpcId] }],
            NextToken: nextToken,
          }),
        ),
      );

      for (const igw of page.InternetGateways ?? []) {
        for (const attachment of igw.Attachments ?? []) {
          if ((attachment.State as string) == 'available') {
            console.log(`Detaching ${igw.InternetGatewayId}`);
            await throttlingBackOff(() =>
              EC2.send(new DetachInternetGatewayCommand({ InternetGatewayId: igw.InternetGatewayId!, VpcId: vpcId })),
            );
          }
          console.warn(`${igw.InternetGatewayId} is not attached. Proceeding to delete.`);
          await throttlingBackOff(() =>
            EC2.send(
              new DeleteInternetGatewayCommand({
                InternetGatewayId: igw.InternetGatewayId!,
              }),
            ),
          );
        }
      }
      nextToken = page.NextToken;
    } while (nextToken);

    // Retrieve Default VPC Subnets
    console.log(`Gathering Subnets for VPC ${vpcId}`);
    nextToken = undefined;
    do {
      const page = await throttlingBackOff(() =>
        EC2.send(
          new DescribeSubnetsCommand({
            Filters: [{ Name: 'vpc-id', Values: [vpcId] }],
            NextToken: nextToken,
          }),
        ),
      );
      for (const subnet of page.Subnets ?? []) {
        console.log(`Delete Subnet ${subnet.SubnetId}`);
        await throttlingBackOff(() =>
          EC2.send(
            new DeleteSubnetCommand({
              SubnetId: subnet.SubnetId!,
            }),
          ),
        );
      }
      nextToken = page.NextToken;
    } while (nextToken);

    // Delete Routes
    console.log(`Gathering list of Route Tables for VPC ${vpcId}`);
    nextToken = undefined;
    do {
      const page = await throttlingBackOff(() =>
        EC2.send(
          new DescribeRouteTablesCommand({
            Filters: [{ Name: 'vpc-id', Values: [vpcId] }],
            NextToken: nextToken,
          }),
        ),
      );
      for (const routeTableObject of page.RouteTables ?? []) {
        for (const routes of routeTableObject.Routes ?? []) {
          if (routes.GatewayId !== 'local') {
            console.log(`Removing route ${routes.DestinationCidrBlock} from ${routeTableObject.RouteTableId}`);
            await throttlingBackOff(() =>
              EC2.send(
                new DeleteRouteCommand({
                  RouteTableId: routeTableObject.RouteTableId!,
                  DestinationCidrBlock: routes.DestinationCidrBlock,
                }),
              ),
            );
          }
        }
      }
      nextToken = page.NextToken;
    } while (nextToken);

    // List and Delete NACLs
    console.log(`Gathering list of NACLs for VPC ${vpcId}`);
    nextToken = undefined;
    do {
      const page = await throttlingBackOff(() =>
        EC2.send(
          new DescribeNetworkAclsCommand({
            Filters: [{ Name: 'vpc-id', Values: [vpcId] }],
            NextToken: nextToken,
          }),
        ),
      );
      for (const networkAclObject of page.NetworkAcls ?? []) {
        if (networkAclObject.IsDefault !== true) {
          console.log(`Deleting Network ACL ID ${networkAclObject.NetworkAclId}`);
          await throttlingBackOff(() =>
            EC2.send(
              new DeleteNetworkAclCommand({
                NetworkAclId: networkAclObject.NetworkAclId!,
              }),
            ),
          );
        } else {
          console.warn(`${networkAclObject.NetworkAclId} is the default NACL. Ignoring`);
        }
      }
      nextToken = page.NextToken;
    } while (nextToken);

    // List and Delete Security Groups
    console.log(`Gathering list of Security Groups for VPC ${vpcId}`);
    nextToken = undefined;
    do {
      const page = await throttlingBackOff(() =>
        EC2.send(
          new DescribeSecurityGroupsCommand({
            Filters: [{ Name: 'vpc-id', Values: [vpcId] }],
            NextToken: nextToken,
          }),
        ),
      );
      for (const securityGroupObject of page.SecurityGroups ?? []) {
        if (securityGroupObject.GroupName == 'default') {
          console.warn(`${securityGroupObject.GroupId} is the default SG. Ignoring`);
        } else {
          console.log(`Deleting Security Group Id ${securityGroupObject.GroupId}`);
          await throttlingBackOff(() =>
            EC2.send(
              new DeleteSecurityGroupCommand({
                GroupId: securityGroupObject.GroupId,
              }),
            ),
          );
        }
      }
      nextToken = page.NextToken;
    } while (nextToken);

    // Once all resources are deleted, delete the VPC.
    console.log(`Deleting VPC ${vpcId}`);
    await throttlingBackOff(() => EC2.send(new DeleteVpcCommand({ VpcId: vpcId })));
  }
}
