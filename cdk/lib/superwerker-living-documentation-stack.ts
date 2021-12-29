import {CfnParameter, Stack, StackProps, custom_resources} from 'aws-cdk-lib';
import {Construct} from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';

import * as path from 'path';

export class SuperwerkerLivingDocumentationStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        const superwerkerDomain = new CfnParameter(this, 'SuperwerkerDomain', {
            type: 'String',
        });

        const livingDocumentationGeneratorFunction = new lambda.Function(this, 'LivingDocumentationGeneratorFunction', {
            runtime: lambda.Runtime.PYTHON_3_9,
            code: lambda.Code.fromAsset(path.join(__dirname, 'superwerker-living-documentation')),
            handler: 'superwerker-living-documentation.handler',
            environment: {
                'SUPERWERKER_DOMAIN': superwerkerDomain.valueAsString,
            },
            logRetention: logs.RetentionDays.ONE_DAY,
        });
        livingDocumentationGeneratorFunction.role?.attachInlinePolicy(new iam.Policy(this, 'LivingDocumentationGeneratorFunctionPolicy', {
                statements: [
                    new iam.PolicyStatement({
                        actions: ['cloudwatch:PutDashboard'],
                        resources: [
                            this.formatArn({
                                service: 'cloudwatch',
                                resource: 'dashboard',
                                region: '',
                                resourceName: 'superwerker'
                            }),
                        ]
                    }),
                    new iam.PolicyStatement({
                        actions: ['cloudwatch:DescribeAlarms'],
                        resources: ['*']
                    }),
                    new iam.PolicyStatement({
                        actions: ['ssm:DescribeParameters'],
                        resources: ['*']
                    }),
                    new iam.PolicyStatement({
                        actions: ['ssm:GetParameters', 'ssm:GetParameter', 'ssm:GetParametersByPath'],
                        resources: [this.formatArn({
                            service: 'ssm',
                            resource: 'parameter',
                            resourceName: 'superwerker/*'
                        })],
                    }),
                ],
            }),
        );

        const livingDocumentationGeneratorFunctionTrigger = new events.Rule(this, 'LivingDocumentationGeneratorFunctionRule', {
            eventPattern: {
                source: ['aws.cloudwatch'],
                detailType: ['CloudWatch Alarm State Change'],
                detail: {
                    'alarmName': ['superwerker-RootMailReady'],
                },
            },
        });

        livingDocumentationGeneratorFunctionTrigger.addTarget(new targets.LambdaFunction(livingDocumentationGeneratorFunction));

        new custom_resources.AwsCustomResource(this, 'InitialInvokeLivingDocumentationGeneratorFunction', {
            onUpdate: {
                service: 'Lambda',
                action: 'invoke',
                physicalResourceId: custom_resources.PhysicalResourceId.of('InitialInvokeLivingDocumentationGeneratorFunction'),
                parameters: {
                    FunctionName: livingDocumentationGeneratorFunction.functionName,
                },
            },
            policy: custom_resources.AwsCustomResourcePolicy.fromStatements([new iam.PolicyStatement({
                actions: ['lambda:InvokeFunction'],
                resources: [livingDocumentationGeneratorFunction.functionArn],
            })])
        });
    }
}
