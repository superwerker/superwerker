import * as path from 'path';
import { CustomResource, Duration, Stack } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import * as lambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import {
  PROP_AUDIT_ACCOUNT_ID,
  PROP_LOG_ARCHIVE_ACCOUNT_ID,
  PROP_MANAGEMENT_ACCOUNT_ID,
  PROP_PARTITION,
  PROP_SECURITY_OU_NAME,
} from '../functions/control-tower-prerequisites';

interface ControlTowerPrerequisitesProps {
  /**
   * Account id of the (Organizations-created) Audit / Security Tooling account.
   */
  readonly auditAccountId: string;
  /**
   * Account id of the (Organizations-created) Log Archive account.
   */
  readonly logArchiveAccountId: string;
  /**
   * Account id of the Organizations management account (trusted by the
   * AWSControlTowerExecution role created in each shared account).
   */
  readonly managementAccountId: string;
  /**
   * Name of the OU (directly under the org root) the shared accounts are moved into.
   * Control Tower landing zone v4.0 default is "Security".
   */
  readonly securityOuName: string;
}

/**
 * Provisions the prerequisites that AWS Control Tower landing zone v4.0 expects but no longer
 * creates for pre-existing (Organizations-created) shared accounts:
 *   1. a Security OU directly under the org root,
 *   2. the Audit + Log Archive accounts moved into it,
 *   3. an AWSControlTowerExecution role (AdministratorAccess + trust to the management account)
 *      in each of those accounts.
 * Idempotent and safe to re-run (reconciles existing OU / accounts / roles).
 */
export class ControlTowerPrerequisites extends Construct {
  public readonly ref: string;

  constructor(scope: Construct, id: string, props: ControlTowerPrerequisitesProps) {
    super(scope, id);

    const resource = new CustomResource(this, 'Resource', {
      serviceToken: ControlTowerPrerequisitesProvider.getOrCreate(this),
      resourceType: 'Custom::ControlTowerPrerequisites',
      properties: {
        [PROP_AUDIT_ACCOUNT_ID]: props.auditAccountId,
        [PROP_LOG_ARCHIVE_ACCOUNT_ID]: props.logArchiveAccountId,
        [PROP_MANAGEMENT_ACCOUNT_ID]: props.managementAccountId,
        [PROP_SECURITY_OU_NAME]: props.securityOuName,
        [PROP_PARTITION]: Stack.of(this).partition,
      },
    });

    this.ref = resource.ref;
  }
}

class ControlTowerPrerequisitesProvider extends Construct {
  /**
   * Returns the singleton provider.
   */
  public static getOrCreate(scope: Construct) {
    const stack = Stack.of(scope);
    const id = 'superwerker.control-tower-prerequisites-provider';
    const x = (stack.node.tryFindChild(id) as ControlTowerPrerequisitesProvider) || new ControlTowerPrerequisitesProvider(stack, id);
    return x.provider.serviceToken;
  }

  private readonly provider: cr.Provider;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.provider = new cr.Provider(this, 'control-tower-prerequisites-provider', {
      onEventHandler: new lambda.NodejsFunction(this, 'control-tower-prerequisites-on-event', {
        entry: path.join(__dirname, '..', 'functions', 'control-tower-prerequisites.ts'),
        runtime: Runtime.NODEJS_20_X,
        timeout: Duration.minutes(5),
        initialPolicy: [
          new iam.PolicyStatement({
            sid: 'OrganizationsReadAndManageOus',
            actions: [
              'organizations:ListRoots',
              'organizations:ListOrganizationalUnitsForParent',
              'organizations:ListParents',
              'organizations:CreateOrganizationalUnit',
              'organizations:MoveAccount',
            ],
            resources: ['*'],
          }),
          new iam.PolicyStatement({
            sid: 'AssumeOrganizationAccountAccessRole',
            actions: ['sts:AssumeRole'],
            resources: [`arn:${Stack.of(this).partition}:iam::*:role/OrganizationAccountAccessRole`],
          }),
        ],
      }),
    });
  }
}
