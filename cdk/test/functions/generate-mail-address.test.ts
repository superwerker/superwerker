import { OnEventRequest } from 'aws-cdk-lib/custom-resources/lib/provider-framework/types';
import { handler, generateEmail } from '../../src/functions/generate-mail-address';

describe('generate-mail-address', () => {
  it('generates new email', async () => {
    const result = await handler({
      RequestType: 'Create',
      ResourceProperties: {
        Domain: 'aws.superluminar.io',
        Name: 'sbstjn-example',
      },
    } as unknown as OnEventRequest);

    expect(result).toMatchObject({ Data: { Email: expect.stringMatching(/root\+[0-9a-f\-]*@aws.superluminar.io/) } });
  });

  it('cannot generate email address for long domain names', async () => {
    expect(() => generateEmail('aws.this-company-name-is-way-too-long-for-aws-control-tower.io')).toThrowError(
      new Error('Unable to generate email address with more than 64 characters (Control Tower requirement)'),
    );
  });

  it('cannot generate email address if no domain is provided', async () => {
    const result = handler({
      RequestType: 'Create',
      ResourceProperties: {
        Domain: '',
        Name: 'sbstjn-example',
      },
    } as unknown as OnEventRequest);

    await expect(result).rejects.toStrictEqual(new Error('Missing domain'));
  });

  it('cannot generate email address if no name is provided', async () => {
    const result = handler({
      RequestType: 'Create',
      ResourceProperties: {
        Domain: 'aws.superluminar.io',
        Name: '',
      },
    } as unknown as OnEventRequest);

    await expect(result).rejects.toStrictEqual(new Error('Missing name'));
  });

  it('Custom Resource Delete', async () => {
    const result = await handler({
      RequestType: 'Delete',
      ResourceProperties: {
        Domain: 'aws.superluminar.io',
        Name: '',
      },
    } as unknown as OnEventRequest);

    expect(result).toMatchObject({});
  });
});
