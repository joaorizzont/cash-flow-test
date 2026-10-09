const UNIQUE_VIOLATION = '23505';

interface PostgresError {
  readonly code: string;
  readonly constraint?: string;
}

const isPostgresError = (error: unknown): error is PostgresError =>
  typeof error === 'object' && error !== null && 'code' in error;

export const isUniqueViolation = (error: unknown, constraint: string): boolean =>
  isPostgresError(error) && error.code === UNIQUE_VIOLATION && error.constraint === constraint;
