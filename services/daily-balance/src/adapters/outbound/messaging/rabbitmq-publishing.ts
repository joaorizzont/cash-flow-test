import type { ConfirmChannel, Options } from 'amqplib';

export interface Publication {
  readonly exchange: string;
  readonly routingKey: string;
  readonly content: Buffer;
  readonly options: Options.Publish;
}

export const publishConfirmed = (
  channel: ConfirmChannel,
  publication: Publication,
): Promise<void> =>
  new Promise((resolve, reject) => {
    channel.publish(
      publication.exchange,
      publication.routingKey,
      publication.content,
      publication.options,
      (error: unknown) => (error ? reject(error) : resolve()),
    );
  });
