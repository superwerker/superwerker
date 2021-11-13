import {aws_ec2, aws_ecs_patterns, CfnParameter, custom_resources, Stack, StackProps} from 'aws-cdk-lib';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { aws_s3 as s3 } from 'aws-cdk-lib';
import * as servicecatalog from '@aws-cdk/aws-servicecatalog-alpha';
import {ContainerImage} from "aws-cdk-lib/aws-ecs";

export class ProductStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    new s3.Bucket(this, 'BucketProduct');
  }
}

class S3BucketProduct extends servicecatalog.ProductStack {
  constructor(scope: Construct, id: string) {
    super(scope, id);
    new s3.Bucket(this, 'BucketProduct');
  }
}

class VpcProduct extends servicecatalog.ProductStack {

  vpc: aws_ec2.Vpc;

  constructor(scope: Construct, id: string) {
    super(scope, id);
    this.vpc = new aws_ec2.Vpc(this, 'Vpc', {
      natGateways: 0
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
    }).getResponseField('Organization.Id');

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
