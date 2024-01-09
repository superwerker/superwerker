import Fs from 'fs';
import { CodeCommitClient, CreateCommitCommand, GetBranchCommand } from '@aws-sdk/client-codecommit';
import * as Handlebars from 'handlebars';

const codecommit = new CodeCommitClient();

const BRANCH_NAME = 'main';
const REPOSITORY_NAME = 'custom-control-tower-configuration';

export async function handler(event: any, _context: any) {
  const AWS_REGION = process.env.AWS_REGION;

  const eventSource = event.detail?.eventSource;
  const eventName = event.detail?.eventName;

  if (eventSource !== 'codecommit.amazonaws.com' || eventName !== 'CreateRepository') {
    console.log('event is not for codecommit repository creation, nothing to do');
    return;
  }

  console.log('adding variables to manifest.yaml');
  await addVariablesToManifest(AWS_REGION!);

  console.log('making inital commit');
  await makeInitalCommit();
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
