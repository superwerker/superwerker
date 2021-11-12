import {custom_resources, Stack, StackProps} from 'aws-cdk-lib';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { aws_s3 as s3 } from 'aws-cdk-lib';
import * as servicecatalog from '@aws-cdk/aws-servicecatalog-alpha';

export class ProductStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    new s3.Bucket(this, 'BucketProduct');
  }
}

export class CdkStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const template = new cdk.App();
    const productStack = new ProductStack(template, 'ProductStackA', {});

    const product = new servicecatalog.CloudFormationProduct(this, 'MyFirstProduct', {
      productName: "My Product",
      owner: "Product Owner",
      productVersions: [
        {
          productVersionName: "v1",
          cloudFormationTemplate: servicecatalog.CloudFormationTemplate.fromAsset(template.synth({

          }).getStackByName(productStack.stackName).templateFullPath),
        },
      ],
    });

    const portfolio = new servicecatalog.Portfolio(this, 'Portfolio', {
      displayName: "superwerker",
      providerName: "superwerker"
    });
    portfolio.addProduct(product);

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
