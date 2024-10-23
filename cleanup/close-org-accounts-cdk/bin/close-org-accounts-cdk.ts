#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { CloseOrgAccountsCdkStack } from '../lib/close-org-accounts-cdk-stack';

const app = new cdk.App();
new CloseOrgAccountsCdkStack(app, 'CloseOrgAccountsCdkStack');
