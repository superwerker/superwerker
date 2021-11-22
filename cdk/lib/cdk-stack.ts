import {
  aws_codecommit,
  aws_ec2,
  aws_ecs_patterns, aws_iam, aws_servicecatalog, CfnOutput, CfnParameter,
  custom_resources, Fn,
  Stack,
  StackProps
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as servicecatalog from '@aws-cdk/aws-servicecatalog-alpha';
import {ContainerImage} from "aws-cdk-lib/aws-ecs";
import {CfnStackSetConstraint} from "aws-cdk-lib/aws-servicecatalog";

class VpcProduct extends servicecatalog.ProductStack {

  vpc: aws_ec2.Vpc;

  constructor(scope: Construct, id: string) {
    super(scope, id);
    this.vpc = new aws_ec2.Vpc(this, 'Vpc', {
      natGateways: 0
    });
  }
}

interface PlatformProductProps extends StackProps {
  codeRepoProduct: servicecatalog.CloudFormationProduct;

  adminRole: aws_iam.Role;
}

class PlatformProduct extends servicecatalog.ProductStack {

  sharedServicesAccountProduct: aws_servicecatalog.CfnCloudFormationProvisionedProduct;

  constructor(scope: Construct, id: string, props: PlatformProductProps) {
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

    const sharedServicesPortfolio = new servicecatalog.Portfolio(this, 'SharedServicesAccountPortfolio', {
      displayName: "superwerker - Shared Services - Platform X", // todo: inject platform name
      providerName: "superwerker"
    });
    // fixme: add permissions for portfolio

    sharedServicesPortfolio.addProduct(props.codeRepoProduct);
    new CfnStackSetConstraint(this, 'CodeRepoStackset', {
      accountList: [this.sharedServicesAccountProduct.getAtt('Outputs.AccountId').toString()],
      adminRole: props.adminRole.roleArn,
      description: "",
      executionRole: "AWSControlTowerExecution",
      portfolioId: sharedServicesPortfolio.portfolioId,
      productId: props.codeRepoProduct.productId,
      regionList: ['eu-central-1'],
      stackInstanceControl: "ALLOWED"
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
  codeRepoProduct: servicecatalog.CloudFormationProduct;
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

    // create CodeCommit in shared-services

    const codeRepoProvisionedProduct = new aws_servicecatalog.CfnCloudFormationProvisionedProduct(this, 'CodeRepoProvisionedProduct', {
      productId: props.codeRepoProduct.productId,
      provisioningArtifactName: '0.0.3',
      provisionedProductName: 'platform-default-dev-coderepo', // fixme: platform name
    })

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

    const codeRepoProduct = new servicecatalog.CloudFormationProduct(this, 'CodeRepoProductStack', {
      productName: "Code Repo",
      owner: "superwerker",
      productVersions: [
        {
          productVersionName: "0.0.3",
          cloudFormationTemplate: servicecatalog.CloudFormationTemplate.fromProductStack(new CodeRepoProduct(this, 'CodeRepoProduct')),
        },
      ],
    });

    const workloadProduct = new servicecatalog.CloudFormationProduct(this, 'WorkloadProductStack', {
      productName: "superwerker Workload",
      owner: "superwerker",
      productVersions: [
        {
          productVersionName: "0.0.3",
          cloudFormationTemplate: servicecatalog.CloudFormationTemplate.fromProductStack(new WorkloadProduct(this, 'WorkloadProduct', {codeRepoProduct: codeRepoProduct})),
        },
      ],
    });
    managementAccountPortfolio.addProduct(workloadProduct);

    const platformProductAdminRole = new aws_iam.Role(this, 'PlatformProductAdminRole', {
      assumedBy: new aws_iam.ServicePrincipal('cloudformation.amazonaws.com')
    });
    platformProductAdminRole.addManagedPolicy(aws_iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess')) // fixme: least privilege

    const platformProduct = new servicecatalog.CloudFormationProduct(this, 'PlatformProductStack', {
      productName: "Platform",
      owner: "superwerker",
      productVersions: [
        {
          productVersionName: "0.0.3",
          cloudFormationTemplate: servicecatalog.CloudFormationTemplate.fromProductStack(new PlatformProduct(this, 'PlatformProduct', {codeRepoProduct: codeRepoProduct, adminRole: platformProductAdminRole})),
        },
      ],
    });
    managementAccountPortfolio.addProduct(platformProduct);

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
