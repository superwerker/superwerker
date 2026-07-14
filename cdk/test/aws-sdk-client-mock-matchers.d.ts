import type { MetadataBearer } from '@smithy/types';
import type { AwsCommand } from 'aws-sdk-client-mock';

// aws-sdk-client-mock-jest augments `declare module 'vitest'`, which was the extension point in
// vitest 1. Vitest declares Assertion in @vitest/expect and extends Matchers, so its matchers have
// to be declared there to be visible.
declare module '@vitest/expect' {
  interface Matchers<T = any> {
    toHaveReceivedCommand<TInput extends object, TOutput extends MetadataBearer>(
      command: new (input: TInput) => AwsCommand<TInput, TOutput>,
    ): T;
    toHaveReceivedCommandTimes<TInput extends object, TOutput extends MetadataBearer>(
      command: new (input: TInput) => AwsCommand<TInput, TOutput>,
      times: number,
    ): T;
    toHaveReceivedCommandWith<TInput extends object, TOutput extends MetadataBearer>(
      command: new (input: TInput) => AwsCommand<TInput, TOutput>,
      input: Partial<TInput>,
    ): T;
    toHaveReceivedAnyCommand(): T;
    toReceiveCommandTimes<TInput extends object, TOutput extends MetadataBearer>(
      command: new (input: TInput) => AwsCommand<TInput, TOutput>,
      times: number,
    ): T;
    toReceiveCommandWith<TInput extends object, TOutput extends MetadataBearer>(
      command: new (input: TInput) => AwsCommand<TInput, TOutput>,
      input: Partial<TInput>,
    ): T;
  }
}
