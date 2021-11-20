import {
  aws_ec2,
  aws_ecs_patterns, aws_servicecatalog, CfnOutput, CfnParameter,
  custom_resources, Fn,
  Stack,
  StackProps
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as servicecatalog from '@aws-cdk/aws-servicecatalog-alpha';
import {ContainerImage} from "aws-cdk-lib/aws-ecs";

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

class WorkloadProduct extends servicecatalog.ProductStack {

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const workloadName = new CfnParameter(this, 'WorkloadName', {});
    const workloadAdminEmail = new CfnParameter(this, 'WorkloadAdminEmail', {});

    // create N AWS accounts
    const provisionedProductName = `${workloadName.valueAsString}-dev`;
    new aws_servicecatalog.CfnCloudFormationProvisionedProduct(this, 'Account', {
      productName: 'AWS Control Tower Account Factory',
      provisioningArtifactName: 'AWS Control Tower Account Factory',
      provisionedProductName: provisionedProductName,
      provisioningParameters: [
        {key: 'AccountName', value: provisionedProductName},
        {key: 'AccountEmail', value: `root+${provisionedProductName}@172194514690.a4662202-595c-46a8-87be-22c29f9d33ad.net`},
        {key: 'SSOUserFirstName', value: 'Isolde'},
        {key: 'SSOUserLastName', value: 'Mawidder-Baden'},
        {key: 'SSOUserEmail', value: workloadAdminEmail.valueAsString},
        {key: 'ManagedOrganizationalUnit', value: 'Sandbox'},
      ]
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

    const workloadProduct = new servicecatalog.CloudFormationProduct(this, 'WorkloadProductStack', {
      productName: "Workload Account",
      owner: "superwerker",
      productVersions: [
        {
          productVersionName: "0.0.3",
          cloudFormationTemplate: servicecatalog.CloudFormationTemplate.fromProductStack(new WorkloadProduct(this, 'WorkloadProduct')),
        },
      ],
    });
    managementAccountPortfolio.addProduct(workloadProduct);

    const platformProduct = new servicecatalog.CloudFormationProduct(this, 'PlatformProductStack', {
      productName: "Platform",
      owner: "superwerker",
      productVersions: [
        {
          productVersionName: "0.0.3",
          cloudFormationTemplate: servicecatalog.CloudFormationTemplate.fromProductStack(new PlatformProduct(this, 'PlatformProduct')),
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
