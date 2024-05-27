import * as path from 'path';
import { CustomResource, Duration, Stack, aws_iam as iam, aws_lambda as lambda } from 'aws-cdk-lib';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct, Node } from 'constructs';
import { PROP_DOMAIN, PROP_ORG_ID, PROP_PASSWORD_PARAM, PROP_NOTIF_EMAIL } from '../functions/workmail-user.on-event-handler';

export interface WorkmailUserProps {
  readonly domain: string;
  readonly workmailOrgId: string;
  readonly passwordParam: string;
  readonly notificationsMail: string;
}

/**
 * Setup Workmail user
 * and inbox rule to redirect all mails to notificationEmail
 */

export class WorkmailUser extends Construct {
  constructor(scope: Construct, id: string, props: WorkmailUserProps) {
    super(scope, id);

    new CustomResource(this, 'Resource', {
      serviceToken: WorkmailUserProvider.getOrCreate(this, { passwordParam: props.passwordParam }),
      resourceType: 'Custom::WorkmailUser',
      properties: {
        [PROP_DOMAIN]: props.domain,
        [PROP_ORG_ID]: props.workmailOrgId,
        [PROP_PASSWORD_PARAM]: props.passwordParam,
        [PROP_NOTIF_EMAIL]: props.notificationsMail,
      },
    });
  }
}

interface WorkmailUserProviderProps {
  readonly passwordParam: string;
}

class WorkmailUserProvider extends Construct {
  /**
   * Returns the singleton provider.
   */
  public static getOrCreate(scope: Construct, props: WorkmailUserProviderProps) {
    const stack = Stack.of(scope);
    const id = 'rootmail.workmail-user-provider';
    const x = (Node.of(stack).tryFindChild(id) as WorkmailUserProvider) || new WorkmailUserProvider(stack, id, props);
    return x.provider.serviceToken;
  }

  private readonly provider: cr.Provider;

  constructor(scope: Construct, id: string, props: WorkmailUserProviderProps) {
    super(scope, id);

    const onEventHandlerFunc = new NodejsFunction(this, 'on-event-handler', {
      entry: path.join(__dirname, '..', 'functions', 'workmail-user.on-event-handler.ts'),
      runtime: lambda.Runtime.NODEJS_20_X,
      logRetention: 3,
      timeout: Duration.seconds(30),
    });

    onEventHandlerFunc.role!.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonWorkMailFullAccess'));

    onEventHandlerFunc.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ssm:PutParameter', 'ssm:DeleteParameter'],
        effect: iam.Effect.ALLOW,
        resources: [`arn:aws:ssm:${Stack.of(this).region}:${Stack.of(this).account}:parameter${props.passwordParam}`],
      }),
    );

    this.provider = new cr.Provider(this, 'workmail-user-provider', {
      onEventHandler: onEventHandlerFunc,
    });
  }
}
