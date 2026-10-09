import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

let container: StartedPostgreSqlContainer | undefined;

export const setup = async (project: TestProject): Promise<void> => {
  container = await new PostgreSqlContainer('postgres:17-alpine').start();
  project.provide('databaseUrl', container.getConnectionUri());
};

export const teardown = async (): Promise<void> => {
  await container?.stop();
};
