import { STATUS_CODES } from 'node:http';
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { DomainError } from '../../../domain/index.js';

const STATUS_BY_CODE: Readonly<Record<string, number>> = {
  VALIDATION_ERROR: 400,
  ENTRY_NOT_FOUND: 404,
  ENTRY_ALREADY_REVERSED: 409,
  BUSINESS_DATE_OUT_OF_RANGE: 422,
  REVERSAL_OF_REVERSAL: 422,
  POINT_OF_SALE_NOT_FOUND: 422,
  IDEMPOTENCY_KEY_REUSED: 422,
};

interface Problem {
  readonly status: number;
  readonly code: string;
  readonly detail: string;
}

const UNEXPECTED_PROBLEM: Problem = {
  status: 500,
  code: 'INTERNAL_ERROR',
  detail: 'An unexpected error occurred',
};

const isClientError = (error: FastifyError): boolean =>
  error.statusCode !== undefined && error.statusCode >= 400 && error.statusCode < 500;

const problemFrom = (error: FastifyError): Problem => {
  if (error instanceof DomainError) {
    return { status: STATUS_BY_CODE[error.code] ?? 422, code: error.code, detail: error.message };
  }
  if (error.validation !== undefined) {
    return { status: 400, code: 'VALIDATION_ERROR', detail: error.message };
  }
  if (isClientError(error)) {
    return { status: error.statusCode ?? 400, code: error.code, detail: error.message };
  }
  return UNEXPECTED_PROBLEM;
};

export const sendProblem = (reply: FastifyReply, problem: Problem): FastifyReply =>
  reply
    .code(problem.status)
    .type('application/problem+json')
    .send({
      type: 'about:blank',
      title: STATUS_CODES[problem.status] ?? 'Error',
      status: problem.status,
      detail: problem.detail,
      code: problem.code,
    });

export const handleError = (
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): FastifyReply => {
  const problem = problemFrom(error);
  if (problem.status >= 500) {
    request.log.error({ err: error }, 'unhandled error');
  }
  return sendProblem(reply, problem);
};

export const handleNotFound = (request: FastifyRequest, reply: FastifyReply): FastifyReply =>
  sendProblem(reply, {
    status: 404,
    code: 'ROUTE_NOT_FOUND',
    detail: `Route ${request.method} ${request.url} not found`,
  });
