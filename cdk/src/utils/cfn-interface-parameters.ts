// copied from https://gist.github.com/john-kontralto/18cd1cd732f93e9417a723a858c0d844#file-cfn-interface-parameters-ts

import { CfnParameter, Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';

interface ParameterGroup {
  Label: { default: string };
  Parameters: string[];
}

interface ParameterLabels {
  [parameterLogicalId: string]: { default: string };
}

interface CloudFormationInterface {
  ParameterGroups: ParameterGroup[];
  ParameterLabels: ParameterLabels;
}

const getStackMetadata = (scope: Construct): { [key: string]: any } => Stack.of(scope).templateOptions.metadata || {};

const CFN_INTERFACE_KEY = 'AWS::CloudFormation::Interface';

const createEmptyCfnInterface = (): CloudFormationInterface => ({ ParameterGroups: [], ParameterLabels: {} });

const getCfnInterface = (scope: Construct): CloudFormationInterface => {
  const metadata = getStackMetadata(scope);
  return metadata[CFN_INTERFACE_KEY] ? metadata[CFN_INTERFACE_KEY] : createEmptyCfnInterface();
};

const updateCfnInterface = (cfnInterface: CloudFormationInterface, scope: Construct): void => {
  const metadata = getStackMetadata(scope);
  metadata[CFN_INTERFACE_KEY] = cfnInterface;
  Stack.of(scope).templateOptions.metadata = metadata;
};

const getGroupFromInterface = (label: string, cfnInterface: CloudFormationInterface): ParameterGroup | undefined =>
  cfnInterface.ParameterGroups.find((group) => group.Label.default === label);

const addGroupToInterface = (label: string, cfnInterface: CloudFormationInterface): ParameterGroup => {
  const existingGroup = getGroupFromInterface(label, cfnInterface);
  if (existingGroup) {
    return existingGroup;
  } else {
    const newGroup = { Label: { default: label }, Parameters: [] };
    cfnInterface.ParameterGroups.push(newGroup);
    return newGroup;
  }
};

const addParameterToGroup = (parameter: CfnParameter, group: ParameterGroup): void => {
  if (group.Parameters.find((logicalId) => logicalId === parameter.logicalId)) {
    return;
  } else {
    group.Parameters.push(parameter.logicalId);
  }
};

export interface ParameterInterfaceProps {
  scope: Construct;
  parameter: CfnParameter;
  groupLabel?: string;
  parameterLabel?: string;
}

export const addParameterToInterface = (props: ParameterInterfaceProps): CfnParameter => {
  const { scope, groupLabel, parameter, parameterLabel } = props;
  const cfnInterface = getCfnInterface(scope);

  if (groupLabel) {
    const group = addGroupToInterface(groupLabel, cfnInterface);
    addParameterToGroup(parameter, group);
  }

  if (parameterLabel) {
    cfnInterface.ParameterLabels[parameter.logicalId] = { default: parameterLabel };
  }

  updateCfnInterface(cfnInterface, scope);
  return parameter;
};
