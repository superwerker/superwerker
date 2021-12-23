import {CfnParameter, Stack, StackProps} from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class SuperwerkerStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
  }
}
