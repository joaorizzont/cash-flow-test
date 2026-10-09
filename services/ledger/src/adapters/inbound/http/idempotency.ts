import { createHash } from 'node:crypto';
import type { IdempotentRequest } from '../../../application/index.js';

interface IdempotentHttpRequest {
  readonly method: string;
  readonly url: string;
  readonly body: unknown;
  readonly headers: {
    readonly 'idempotency-key'?: string | undefined;
  };
}

const canonicalJson = (body: unknown): string => {
  const isObject = typeof body === 'object' && body !== null && !Array.isArray(body);
  return JSON.stringify(body ?? null, isObject ? Object.keys(body).sort() : undefined);
};

const fingerprintOf = (request: IdempotentHttpRequest): string =>
  createHash('sha256')
    .update(`${request.method} ${request.url}\n${canonicalJson(request.body)}`)
    .digest('hex');

export interface IdempotentOperation {
  readonly name: string;
  readonly merchantId: string;
}

export const idempotentRequestOf = (
  request: IdempotentHttpRequest,
  operation: IdempotentOperation,
): IdempotentRequest => ({
  merchantId: operation.merchantId,
  key: request.headers['idempotency-key'] ?? null,
  operation: operation.name,
  fingerprint: fingerprintOf(request),
});
