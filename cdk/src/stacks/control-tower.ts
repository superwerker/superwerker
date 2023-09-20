import path from 'path';
import { Arn, aws_events as events, aws_events_targets as targets, aws_iam as iam, aws_lambda as lambda, CfnParameter, CfnWaitCondition, CfnWaitConditionHandle, NestedStack, NestedStackProps, Stack } from 'aws-cdk-lib';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import { EnableControltower } from '../constructs/enable-controltower';
import { Runtime } from 'aws-cdk-lib/aws-lambda';

export class ControlTowerStack extends NestedStack {
  constructor(scope: Construct, id: string, props: NestedStackProps) {
    super(scope, id, props);

    const logArchiveAWSAccountEmail = new CfnParameter(this, 'LogArchiveAWSAccountEmail', {
      type: 'String',
    });
    const auditAWSAccountEmail = new CfnParameter(this, 'AuditAWSAccountEmail', {
      type: 'String',
    });

    new EnableControltower(this, 'EnableControlTower', {
      logArchiveAwsAccountEmail: logArchiveAWSAccountEmail.valueAsString,
      auditAwsAccountEmail: auditAWSAccountEmail.valueAsString,
    });

    const controlTowerReadyHandle = new CfnWaitConditionHandle(this, 'ControlTowerReadyHandle');
    new CfnWaitCondition(this, 'ControlTowerReadyHandleWaitCondition', {
      handle: controlTowerReadyHandle.ref,
      timeout: '7200',
    });

    const superwerkerBootstrapFunction = new NodejsFunction(this, 'SuperwerkerBootstrapFunction', {
      entry: path.join(__dirname, '..', 'functions', 'superwerker-bootstrap-function.ts'),
      runtime: Runtime.NODEJS_16_X,
      environment: {
        SIGNAL_URL: controlTowerReadyHandle.ref,
      },
    });
    (superwerkerBootstrapFunction.node.defaultChild as lambda.CfnFunction).overrideLogicalId('SuperwerkerBootstrapFunction');
    superwerkerBootstrapFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ssm:PutParameter'],
        resources: [
          Arn.format(
            {
              service: 'ssm',
              resource: 'parameter',
              resourceName: 'superwerker*',
            },
            Stack.of(this),
          ),
        ],
      }),
    );
    superwerkerBootstrapFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['events:PutEvents'],
        resources: [
          Arn.format(
            {
              service: 'events',
              resource: 'event-bus',
              resourceName: 'default',
            },
            Stack.of(this),
          ),
        ],
      }),
    );

    const eventRule = new events.Rule(this, 'Call', {
      eventPattern: {
        detailType: [
          'AWS Service Event via CloudTrail',
        ],
        source: [
          'aws.controltower',
        ],
        detail: {
          serviceEventDetails: {
            setupLandingZoneStatus: {
              state: [
                'SUCCEEDED',
              ],
            },
          },
          eventName: [
            'SetupLandingZone',
          ],
        },
      },
    });
    eventRule.addTarget(new targets.LambdaFunction(superwerkerBootstrapFunction, {
      event: events.RuleTargetInput.fromEventPath('$.detail.serviceEventDetails.setupLandingZoneStatus'),
    }));
  }
}
