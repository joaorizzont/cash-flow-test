import type { MessageProperties, Options } from 'amqplib';

export const ATTEMPT_HEADER = 'x-attempt';
export const LAST_ERROR_HEADER = 'x-last-error';
export const DEAD_LETTER_REASON_HEADER = 'x-dead-letter-reason';

export const attemptOf = (properties: MessageProperties): number => {
  const value: unknown = properties.headers?.[ATTEMPT_HEADER];
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : 1;
};

export const republishOptionsOf = (
  properties: MessageProperties,
  headers: Readonly<Record<string, unknown>>,
): Options.Publish => ({
  persistent: true,
  messageId: properties.messageId as string | undefined,
  type: properties.type as string | undefined,
  contentType: properties.contentType as string | undefined,
  appId: properties.appId as string | undefined,
  headers: { ...properties.headers, ...headers },
});
