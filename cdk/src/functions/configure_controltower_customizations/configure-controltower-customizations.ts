import Fs from 'fs';
import { CodeCommitClient, CreateCommitCommand, GetBranchCommand } from '@aws-sdk/client-codecommit';
import { SSMClient, GetParameterCommand, PutParameterCommand, ParameterType } from '@aws-sdk/client-ssm';
import * as Handlebars from 'handlebars';

const codecommit = new CodeCommitClient();
const ssm = new SSMClient();

const BRANCH_NAME = 'main';
const REPOSITORY_NAME = 'custom-control-tower-configuration';
const SSM_PARAMETER = { Name: process.env.CONTROLTOWER_CUSTOMIZATIONS_DONE_SSM_PARAMETER };

export async function handler(event: any, _context: any) {
  const AWS_REGION = process.env.AWS_REGION;

  const snsMessage = event.Records[0].Sns.Message;
  if (!snsMessage.includes('CREATE_COMPLETE')) {
    console.log('stack is not in CREATE_COMPLETE state, nothing to do yet');
    return;
  }

  let customizationsConfigured = true;
  try {
    const getParameterCommand = new GetParameterCommand(SSM_PARAMETER);
    await ssm.send(getParameterCommand);
  } catch (err) {
    if (err) {
      customizationsConfigured = false;
    }
  }

  if (customizationsConfigured) {
    console.log('Control tower customizations have been configured initially, nothing to do.');
    return;
  }

  console.log('Control tower customizations have not been configured yet, starting initial configuration.');

  console.log('adding variables to manifest.yaml');
  await addVariablesToManifest(AWS_REGION!);

  console.log('making inital commit');
  await makeInitalCommit();

  console.log('setting initial commit ssm parameter');
  const params = {
    Name: SSM_PARAMETER.Name,
    Value: 'true',
    Type: ParameterType.STRING,
  };
  const putParameterCommand = new PutParameterCommand(params);
  await ssm.send(putParameterCommand);
}

async function makeInitalCommit() {
  const getBranchCommand = new GetBranchCommand({ branchName: BRANCH_NAME, repositoryName: REPOSITORY_NAME });
  const branchInfo = await codecommit.send(getBranchCommand);
  const commitId = branchInfo.branch!.commitId;

  const params = {
    branchName: BRANCH_NAME,
    repositoryName: REPOSITORY_NAME,
    commitMessage: 'inital configuration',
    parentCommitId: commitId,
    putFiles: getFilesToUpload(),
  };
  const createCommitCommand = new CreateCommitCommand(params);
  await codecommit.send(createCommitCommand);
}

function getFilesToUpload() {
  // TODO dynamically get files from config directory
  let filesToUpload = [
    {
      filePath: '/service-control-policies/superwerker-sandbox-scp.json',
      fileContent: getBufferFromFile('./config/service-control-policies/superwerker-sandbox-scp.json'),
    },
    {
      filePath: '/service-control-policies/superwerker-cfct-only-us-scp.json',
      fileContent: getBufferFromFile('./config/service-control-policies/superwerker-cfct-only-us-scp.json'),
    },
    {
      filePath: '/cloudformation/iam-access-analyzer.yaml',
      fileContent: getBufferFromFile('./config/cloudformation/iam-access-analyzer.yaml'),
    },
    {
      filePath: '/manifest.yaml',
      fileContent: getBufferFromFile('/tmp/manifest.yaml'),
    },
  ];
  return filesToUpload;
}

function getBufferFromFile(filePath: string) {
  return Buffer.from(Fs.readFileSync(filePath).toString('utf-8'));
}

function addVariablesToManifest(region: string) {
  const source = Fs.readFileSync('./config/manifest.yaml').toString();
  const template = Handlebars.compile(source);
  const contents = template({ REGION: `${region}` });
  Fs.writeFileSync('/tmp/manifest.yaml', contents);
}
