import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RabbitMQContainer, type StartedRabbitMQContainer } from '@testcontainers/rabbitmq';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
    rabbitMqUrl: string;
  }
}

let postgres: StartedPostgreSqlContainer | undefined;
let rabbitMq: StartedRabbitMQContainer | undefined;

export const setup = async (project: TestProject): Promise<void> => {
  [postgres, rabbitMq] = await Promise.all([
    new PostgreSqlContainer('postgres:17-alpine').start(),
    new RabbitMQContainer('rabbitmq:4-management-alpine').start(),
  ]);
  project.provide('databaseUrl', postgres.getConnectionUri());
  project.provide('rabbitMqUrl', rabbitMq.getAmqpUrl());
};

export const teardown = async (): Promise<void> => {
  await Promise.all([postgres?.stop(), rabbitMq?.stop()]);
};
