/**
 *  Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import {
  BatchDisableStandardsCommand,
  BatchEnableStandardsCommand,
  DescribeStandardsCommand,
  DescribeStandardsControlsCommand,
  DescribeStandardsControlsCommandOutput,
  GetEnabledStandardsCommand,
  SecurityHubClient,
  StandardsStatus,
  UpdateStandardsControlCommand,
} from '@aws-sdk/client-securityhub';
import { throttlingBackOff } from '../utils/throttle';

export class SecurityHubStandardsMgmt {
  private securityHubClient: SecurityHubClient;

  constructor(securityHubClientAuditAccount: SecurityHubClient) {
    this.securityHubClient = securityHubClientAuditAccount;
  }

  async enableStandards(standardsToEnable: { name: string; enable: boolean; controlsToDisable: string[] | undefined }[]) {
    // Get AWS defined security standards name and ARN
    const awsSecurityHubStandards: { [name: string]: string }[] = [];
    let nextToken: string | undefined = undefined;
    do {
      const page = await throttlingBackOff(() => this.securityHubClient.send(new DescribeStandardsCommand({ NextToken: nextToken })));
      for (const standard of page.Standards!) {
        if (standard.StandardsArn && standard.Name) {
          const securityHubStandard: { [name: string]: string } = {};
          securityHubStandard[standard.Name] = standard.StandardsArn;
          awsSecurityHubStandards.push(securityHubStandard);
        }
      }
      nextToken = page.NextToken;
    } while (nextToken);

    // wait for all standards to be ready
    let allStandardsReady = false;
    let retries = 0;
    while (!allStandardsReady && retries < 200) {
      let existingEnabledStandards = await getExistingEnabledStandards(this.securityHubClient);
      allStandardsReady = existingEnabledStandards.every((item) => item.StandardsStatus === 'READY');
      console.log('Waiting for all standards to get in status READY: ', existingEnabledStandards);
      retries++;
    }

    const standardsModificationList = await this.getStandardsModificationList(standardsToEnable, awsSecurityHubStandards);

    console.log('Enabling Standards');

    // When there are standards to be enable
    if (standardsModificationList.toEnableStandardRequests.length > 0) {
      console.log('To enable:');
      console.log(standardsModificationList.toEnableStandardRequests);
      await throttlingBackOff(() =>
        this.securityHubClient.send(
          new BatchEnableStandardsCommand({ StandardsSubscriptionRequests: standardsModificationList.toEnableStandardRequests }),
        ),
      );
    }

    // When there are standards to be disabled
    if (standardsModificationList.toDisableStandardArns!.length > 0) {
      console.log(`Disabling standard ${standardsModificationList.toDisableStandardArns!}`);
      await throttlingBackOff(() =>
        this.securityHubClient.send(
          new BatchDisableStandardsCommand({ StandardsSubscriptionArns: standardsModificationList.toDisableStandardArns }),
        ),
      );
    }

    // get list of controls to modify
    const controlsToModify = await this.getControlArnsToModify(standardsToEnable, awsSecurityHubStandards);
    console.log('Controls to disable: ', controlsToModify.disableStandardControlArns);
    console.log('Controls to enable: ', controlsToModify.enableStandardControlArns);

    // Disable standard controls
    for (const controlArnToModify of controlsToModify.disableStandardControlArns) {
      await throttlingBackOff(() =>
        this.securityHubClient.send(
          new UpdateStandardsControlCommand({
            StandardsControlArn: controlArnToModify,
            ControlStatus: 'DISABLED',
            DisabledReason: 'Control disabled by superwerker',
          }),
        ),
      );
    }

    // Enable standard controls
    for (const controlArnToModify of controlsToModify.enableStandardControlArns) {
      await throttlingBackOff(() =>
        this.securityHubClient.send(
          new UpdateStandardsControlCommand({ StandardsControlArn: controlArnToModify, ControlStatus: 'ENABLED' }),
        ),
      );
    }
  }

  async disableStandards() {
    const existingEnabledStandards = await getExistingEnabledStandards(this.securityHubClient);
    const subscriptionArns: string[] = [];
    existingEnabledStandards.forEach((standard) => {
      subscriptionArns.push(standard.StandardsSubscriptionArn);
    });

    if (subscriptionArns.length > 0) {
      console.log('Below listed standards disable during delete');
      console.log(subscriptionArns);
      await throttlingBackOff(() =>
        this.securityHubClient.send(new BatchDisableStandardsCommand({ StandardsSubscriptionArns: subscriptionArns })),
      );
    }
  }

  /**
   * Function to provide list of control arns for standards to be enable or disable
   * @param securityHubClient
   * @param standardsToEnable
   * @param awsSecurityHubStandards
   */
  private async getControlArnsToModify(
    standardsToEnable: { name: string; enable: boolean; controlsToDisable: string[] | undefined }[],
    awsSecurityHubStandards: { [name: string]: string }[],
  ): Promise<{ disableStandardControlArns: string[]; enableStandardControlArns: string[] }> {
    let existingEnabledStandards = await getExistingEnabledStandards(this.securityHubClient);
    const disableStandardControls: string[] = [];
    const enableStandardControls: string[] = [];

    let nextToken: string | undefined = undefined;
    for (const inputStandard of standardsToEnable) {
      console.log(`inputStandard: ${JSON.stringify(inputStandard)}`);
      if (inputStandard.enable) {
        for (const awsSecurityHubStandard of awsSecurityHubStandards) {
          if (awsSecurityHubStandard[inputStandard.name]) {
            console.log(`Standard Name: ${awsSecurityHubStandard[inputStandard.name]}`);

            let existingEnabledStandard;

            let retries = 0;
            while (!existingEnabledStandard && retries < 200) {
              existingEnabledStandard = existingEnabledStandards.find(
                (item) => item.StandardsArn === awsSecurityHubStandard[inputStandard.name] && item.StandardsStatus === 'READY',
              );
              existingEnabledStandards = await getExistingEnabledStandards(this.securityHubClient);
              console.log('waiting for standard to get in status READY: ', existingEnabledStandards);
              retries++;
            }

            if (existingEnabledStandard) {
              console.log(`Getting controls for ${existingEnabledStandard!.StandardsSubscriptionArn} subscription`);

              const standardsControl = [];
              do {
                const page = await this.getDescribeStandardsControls(existingEnabledStandard!.StandardsSubscriptionArn, nextToken);
                for (const control of page.Controls!) {
                  standardsControl.push(control);
                }
                nextToken = page.NextToken;
              } while (nextToken);

              console.log(`When control list available for ${existingEnabledStandard!.StandardsSubscriptionArn}`);
              console.log(standardsControl);

              for (const control of standardsControl) {
                if (inputStandard.controlsToDisable!.includes(control.ControlId!)) {
                  console.log('following should be disabled: ', control.ControlId!);
                  disableStandardControls.push(control.StandardsControlArn!);
                } else {
                  if (control.ControlStatus == 'DISABLED') {
                    console.log('following should be enabled: ', control.ControlId!);
                    enableStandardControls.push(control.StandardsControlArn!);
                  }
                }
              }
            } else {
              throw new Error(`Standard ${inputStandard.name} could not be enabled`);
            }
          }
        }
      }
    }

    return { disableStandardControlArns: disableStandardControls, enableStandardControlArns: enableStandardControls };
  }

  /**
   * Function to be executed before event specific action starts, this function makes the list of standards to enable or disable based on the input
   * @param securityHubClient
   * @param standardsToEnable
   * @param awsSecurityHubStandards
   */
  private async getStandardsModificationList(
    standardsToEnable: { name: string; enable: boolean; controlsToDisable: string[] | undefined }[],
    awsSecurityHubStandards: { [name: string]: string }[],
  ) {
    const existingEnabledStandards = await getExistingEnabledStandards(this.securityHubClient);
    const toEnableStandardRequests = [];
    const toDisableStandardArns: string[] | undefined = [];

    // if no standard provided to enable, then disable all existing enabled standards
    if (!standardsToEnable || standardsToEnable.length === 0) {
      for (const existingEnabledStandard of existingEnabledStandards) {
        toDisableStandardArns.push(existingEnabledStandard!.StandardsSubscriptionArn);
      }
    }

    // for each standard to enable, check if it is already enabled, if not then add it to enable list, else to disable list
    for (const inputStandard of standardsToEnable) {
      if (inputStandard.enable) {
        for (const awsSecurityHubStandard of awsSecurityHubStandards) {
          if (awsSecurityHubStandard[inputStandard.name]) {
            const existingEnabledStandard = existingEnabledStandards.filter(
              (item) => item.StandardsArn === awsSecurityHubStandard[inputStandard.name],
            );
            if (existingEnabledStandard.length === 0) {
              toEnableStandardRequests.push({ StandardsArn: awsSecurityHubStandard[inputStandard.name] });
            }
          }
        }
      } else {
        for (const awsSecurityHubStandard of awsSecurityHubStandards) {
          if (awsSecurityHubStandard[inputStandard.name]) {
            const existingEnabledStandard = existingEnabledStandards.find(
              (item) => item.StandardsArn === awsSecurityHubStandard[inputStandard.name],
            );

            if (existingEnabledStandard) {
              toDisableStandardArns.push(existingEnabledStandard!.StandardsSubscriptionArn);
            }
          }
        }
      }
    }

    return { toEnableStandardRequests: toEnableStandardRequests, toDisableStandardArns: toDisableStandardArns };
  }

  private async getDescribeStandardsControls(
    standardsSubscriptionArn: string,
    nextToken?: string,
  ): Promise<DescribeStandardsControlsCommandOutput> {
    return throttlingBackOff(() =>
      this.securityHubClient.send(
        new DescribeStandardsControlsCommand({ StandardsSubscriptionArn: standardsSubscriptionArn, NextToken: nextToken }),
      ),
    );
  }
}

export async function getExistingEnabledStandards(securityHubClient: SecurityHubClient) {
  const response = await throttlingBackOff(() => securityHubClient.send(new GetEnabledStandardsCommand({})));

  // Get list of  existing enabled standards within securityhub
  const existingEnabledStandardArns: {
    StandardsArn: string;
    StandardsInput: Record<string, string>;
    StandardsStatus: StandardsStatus;
    StandardsSubscriptionArn: string;
  }[] = [];
  response.StandardsSubscriptions!.forEach((item) => {
    existingEnabledStandardArns.push({
      StandardsArn: item.StandardsArn!,
      StandardsInput: item.StandardsInput!,
      StandardsStatus: item.StandardsStatus!,
      StandardsSubscriptionArn: item.StandardsSubscriptionArn!,
    });
  });

  return existingEnabledStandardArns;
}
