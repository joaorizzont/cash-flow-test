import type { LedgerApi } from './adapters/inbound/http/ledger-api.js';
import { OutboxWriter } from './adapters/outbound/postgres/outbox-writer.js';
import type { PostgresDatabase } from './adapters/outbound/postgres/postgres-database.js';
import { PostgresEntryRepository } from './adapters/outbound/postgres/postgres-entry-repository.js';
import { PostgresIdempotencyStore } from './adapters/outbound/postgres/postgres-idempotency-store.js';
import { PostgresPointOfSaleRepository } from './adapters/outbound/postgres/postgres-point-of-sale-repository.js';
import { SystemClock } from './adapters/outbound/system/system-clock.js';
import { UuidV7Generator } from './adapters/outbound/system/uuid-v7-generator.js';
import {
  ConfigurePointOfSaleService,
  GetEntryService,
  IdempotencyGuard,
  ListEntriesService,
  RecordEntryService,
  ReverseEntryService,
  TimeZoneResolver,
  type Clock,
  type IdGenerator,
} from './application/index.js';
import { BusinessDatePolicy, TimeZone } from './domain/index.js';

export interface LedgerSettings {
  readonly defaultTimeZone: string;
  readonly maxBackdatedDays: number;
}

export interface LedgerDependencies {
  readonly database: PostgresDatabase;
  readonly settings: LedgerSettings;
  readonly clock?: Clock;
  readonly idGenerator?: IdGenerator;
}

export const createLedgerApi = (dependencies: LedgerDependencies): LedgerApi => {
  const { database, settings } = dependencies;
  const clock = dependencies.clock ?? new SystemClock();
  const idGenerator = dependencies.idGenerator ?? new UuidV7Generator();
  const entries = new PostgresEntryRepository(database, new OutboxWriter(database, idGenerator));
  const pointsOfSale = new PostgresPointOfSaleRepository(database);

  return {
    recordEntry: new RecordEntryService({
      repository: entries,
      clock,
      idGenerator,
      businessDatePolicy: new BusinessDatePolicy(settings.maxBackdatedDays),
      timeZoneResolver: new TimeZoneResolver(pointsOfSale, TimeZone.from(settings.defaultTimeZone)),
    }),
    reverseEntry: new ReverseEntryService({ repository: entries, clock, idGenerator }),
    getEntry: new GetEntryService(entries),
    listEntries: new ListEntriesService(entries),
    configurePointOfSale: new ConfigurePointOfSaleService(pointsOfSale),
    idempotency: new IdempotencyGuard({
      store: new PostgresIdempotencyStore(database),
      transactions: database,
    }),
  };
};
