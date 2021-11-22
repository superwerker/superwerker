import {
  App,
  aws_codecommit,
  aws_ec2,
  aws_ecs_patterns, aws_iam, aws_servicecatalog, CfnOutput, CfnParameter, CfnStackSet,
  custom_resources, FileAssetPackaging, Fn,
  Stack,
  StackProps
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as servicecatalog from '@aws-cdk/aws-servicecatalog-alpha';
import {ContainerImage} from "aws-cdk-lib/aws-ecs";
import {
  CfnLaunchRoleConstraint,
  CfnPortfolioPrincipalAssociation,
  CfnStackSetConstraint
} from "aws-cdk-lib/aws-servicecatalog";

class VpcProduct extends servicecatalog.ProductStack {

  vpc: aws_ec2.Vpc;

  constructor(scope: Construct, id: string) {
    super(scope, id);
    this.vpc = new aws_ec2.Vpc(this, 'Vpc', {
      natGateways: 0
    });
  }
}

class PlatformProduct extends servicecatalog.ProductStack {

  sharedServicesAccountProduct: aws_servicecatalog.CfnCloudFormationProvisionedProduct;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const platformName = new CfnParameter(this, 'PlatformName', {});
    const platformAdminEmail = new CfnParameter(this, 'PlatformAdminEmail', {});

    // create N AWS accounts
    const provisionedProductName = `platform-${platformName.valueAsString}-sharedservices`;
    this.sharedServicesAccountProduct = new aws_servicecatalog.CfnCloudFormationProvisionedProduct(this, 'Account', {
      productName: 'AWS Control Tower Account Factory',
      provisioningArtifactName: 'AWS Control Tower Account Factory',
      provisionedProductName: provisionedProductName,
      provisioningParameters: [
        {key: 'AccountName', value: provisionedProductName},
        {key: 'AccountEmail', value:
              `root+${Fn.select(1, Fn.split('-', Fn.select(2, Fn.split('/', this.stackId))))}@172194514690.a4662202-595c-46a8-87be-22c29f9d33ad.net`
        },
        {key: 'SSOUserFirstName', value: 'Platform'},
        {key: 'SSOUserLastName', value: 'Platform'},
        {key: 'SSOUserEmail', value: platformAdminEmail.valueAsString},
        {key: 'ManagedOrganizationalUnit', value: 'Sandbox'},
      ]
    })
  }
}

class CodeRepoProduct extends servicecatalog.ProductStack {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    new aws_codecommit.Repository(this, 'CodeRepo', {
      repositoryName: "workload" // fixme: inject
    })
  }
}

interface WorkloadProductProps extends StackProps {
  codeRepoStack: servicecatalog.ProductStack;
  adminRole: aws_iam.Role;
  sharedServicesAccountProduct: aws_servicecatalog.CfnCloudFormationProvisionedProduct;
}

class WorkloadProduct extends servicecatalog.ProductStack {

  constructor(scope: Construct, id: string, props: WorkloadProductProps) {
    super(scope, id);

    const workloadName = new CfnParameter(this, 'WorkloadName', {});
    const workloadAdminEmail = new CfnParameter(this, 'WorkloadAdminEmail', {});

    // create N AWS accounts
    const provisionedProductName = `workload-${workloadName.valueAsString}-dev`;
    new aws_servicecatalog.CfnCloudFormationProvisionedProduct(this, 'Account', {
      productName: 'AWS Control Tower Account Factory',
      provisioningArtifactName: 'AWS Control Tower Account Factory',
      provisionedProductName: provisionedProductName,
      provisioningParameters: [
        {key: 'AccountName', value: provisionedProductName},
        {key: 'AccountEmail', value:
              `root+${Fn.select(1, Fn.split('-', Fn.select(2, Fn.split('/', this.stackId))))}@172194514690.a4662202-595c-46a8-87be-22c29f9d33ad.net`
        },
        {key: 'SSOUserFirstName', value: 'Isolde'},
        {key: 'SSOUserLastName', value: 'Mawidder-Baden'},
        {key: 'SSOUserEmail', value: workloadAdminEmail.valueAsString},
        {key: 'ManagedOrganizationalUnit', value: 'Sandbox'},
      ]
    })

    new CfnStackSet(this, 'StackSet', {
      stackSetName: `${id}StackSet`,
      permissionModel: 'SELF_MANAGED',
      templateUrl: servicecatalog.CloudFormationTemplate.fromProductStack(props.codeRepoStack).bind(this).httpUrl,
      executionRoleName: 'AWSControlTowerExecution',
      administrationRoleArn: props.adminRole.roleArn,
      stackInstancesGroup: [
        {
          deploymentTargets: {
            accounts: [props.sharedServicesAccountProduct.getAtt('Outputs.AccountId').toString()],
          },
          regions: [this.region],
        },
      ],
    });

  }
}

interface FargateProductProps extends StackProps {
  vpc: aws_ec2.IVpc;
}

class FargateProduct extends servicecatalog.ProductStack {

  constructor(scope: Construct, id: string, props: FargateProductProps) {
    super(scope, id);

    new aws_ecs_patterns.ApplicationLoadBalancedFargateService(this, 'FargateService', {
      vpc: props.vpc,
      taskImageOptions: {
        image: ContainerImage.fromRegistry('amazon/amazon-ecs-sample')
      },
      taskSubnets: props.vpc.selectSubnets({subnetType: aws_ec2.SubnetType.PUBLIC}),
      assignPublicIp: true,
    });
  }
}

export class CdkStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const managementAccountPortfolio = new servicecatalog.Portfolio(this, 'ManagementAccountPortfolio', {
      displayName: "superwerker - Management Account",
      providerName: "superwerker"
    });

    const portfolio = new servicecatalog.Portfolio(this, 'Portfolio', {
      displayName: "superwerker",
      providerName: "superwerker"
    });

    const vpcProductStack = new VpcProduct(this, 'VpcProduct');
    const vpcProduct = new servicecatalog.CloudFormationProduct(this, 'VpcProductStack', {
      productName: "VPC",
      owner: "superwerker",
      productVersions: [
        {
          productVersionName: "0.0.1",
          cloudFormationTemplate: servicecatalog.CloudFormationTemplate.fromProductStack(vpcProductStack),
        },
      ],
    });
    portfolio.addProduct(vpcProduct);

    const fargateProduct = new servicecatalog.CloudFormationProduct(this, 'FargateProductStack', {
      productName: "Fargate",
      owner: "superwerker",
      productVersions: [
        {
          productVersionName: "0.0.3",
          cloudFormationTemplate: servicecatalog.CloudFormationTemplate.fromProductStack(new FargateProduct(this, 'FargateProduct', {vpc: vpcProductStack.vpc})),
        },
      ],
    });
    portfolio.addProduct(fargateProduct);

    const codeRepoStack = new CodeRepoProduct(this, 'TargetAccountStack')

    const platformProductAdminRole = new aws_iam.Role(this, 'PlatformProductAdminRole', {
      assumedBy: new aws_iam.ServicePrincipal('cloudformation.amazonaws.com')
    });
    platformProductAdminRole.addManagedPolicy(aws_iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess')) // fixme: least privilege

    const serviceCatalogAdminRole = new aws_iam.Role(this, 'ServiceCatalogAdminRole', {
      assumedBy: new aws_iam.ServicePrincipal('servicecatalog.amazonaws.com')
    });
    serviceCatalogAdminRole.addManagedPolicy(aws_iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess')) // fixme: least privilege

    const platformStack = new PlatformProduct(this, 'PlatformProduct');
    const platformProduct = new servicecatalog.CloudFormationProduct(this, 'PlatformProductStack', {
      productName: "Platform",
      owner: "superwerker",
      productVersions: [
        {
          productVersionName: "0.0.3",
          cloudFormationTemplate: servicecatalog.CloudFormationTemplate.fromProductStack(platformStack),
        },
      ],
    });
    managementAccountPortfolio.addProduct(platformProduct);

    new CfnLaunchRoleConstraint(this, 'PlatformProductLaunchRoleConstraint', {
      portfolioId: managementAccountPortfolio.portfolioId, productId: platformProduct.productId, roleArn: serviceCatalogAdminRole.roleArn,
    });

    const workloadProduct = new servicecatalog.CloudFormationProduct(this, 'WorkloadProductStack', {
      productName: "superwerker Workload",
      owner: "superwerker",
      productVersions: [
        {
          productVersionName: "0.0.3",
          cloudFormationTemplate: servicecatalog.CloudFormationTemplate.fromProductStack(new WorkloadProduct(this, 'WorkloadProduct', {codeRepoStack: codeRepoStack, adminRole: platformProductAdminRole, sharedServicesAccountProduct: platformStack.sharedServicesAccountProduct})),
        },
      ],
    });
    new CfnPortfolioPrincipalAssociation(this, 'WorkloadProductPortfolioPrincipalAssociation', {
      portfolioId: managementAccountPortfolio.portfolioId, principalArn: serviceCatalogAdminRole.roleArn, principalType: "IAM"

    })
    managementAccountPortfolio.addProduct(workloadProduct);

    const orgId = new custom_resources.AwsCustomResource(this, 'OrgRootLookup', {
      onUpdate: {   // will also be called for a CREATE event
        service: 'Organizations',
        action: 'describeOrganization',
        region: 'us-east-1',
        physicalResourceId: custom_resources.PhysicalResourceId.of('OrgRoot'),
      },
      policy: custom_resources.AwsCustomResourcePolicy.fromSdkCalls({resources: ['*']})
    }).getResponseField('Organization.Id');

    const serviceCatalogOrganizationsAccess = new  custom_resources.AwsCustomResource(this, 'ServiceCatalogOrganizationsAccess', {
      onUpdate: {   // will also be called for a CREATE event
        service: 'Organizations',
        action: 'enableAWSServiceAccess',
        parameters: {
          ServicePrincipal: 'servicecatalog.amazonaws.com',
        },
        region: 'us-east-1',
        physicalResourceId: custom_resources.PhysicalResourceId.of('ServiceCatalogOrganizationsAccess'),
      },
      policy: custom_resources.AwsCustomResourcePolicy.fromSdkCalls({resources: ['*']})
    });

    new custom_resources.AwsCustomResource(this, 'OrgShare', {
      onCreate: {
        service: 'ServiceCatalog',
        action: 'createPortfolioShare',
        physicalResourceId: custom_resources.PhysicalResourceId.of('OrgPortfolioShare'),
        parameters: {
          OrganizationNode: {
            Type: 'ORGANIZATION',
            Value: orgId,
          },
          PortfolioId: portfolio.portfolioId,
        },
      },
      onUpdate: {
        service: 'ServiceCatalog',
        action: 'updatePortfolioShare',
        physicalResourceId: custom_resources.PhysicalResourceId.of('OrgPortfolioShare'),
        parameters: {
          OrganizationNode: {
            Type: 'ORGANIZATION',
            Value: orgId,
          },
          PortfolioId: portfolio.portfolioId,
        },
      },
      onDelete: {
        service: 'ServiceCatalog',
        action: 'deletePortfolioShare',
        physicalResourceId: custom_resources.PhysicalResourceId.of('OrgPortfolioShare'),
        parameters: {
          OrganizationNode: {
            Type: 'ORGANIZATION',
            Value: orgId,
          },
          PortfolioId: portfolio.portfolioId,
        },
      },

      policy: custom_resources.AwsCustomResourcePolicy.fromSdkCalls({resources: ['*']})
    });

  }
}
