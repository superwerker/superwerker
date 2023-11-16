import { CodeCommit } from 'aws-sdk';

const codecommit = new CodeCommit();

export async function handler(event: any, _context: any) {
  console.log('I have been started');
  console.log('event', event);
}
