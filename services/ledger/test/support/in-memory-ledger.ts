import type { LedgerApi } from '../../src/adapters/inbound/http/ledger-api.js';
import {
  ConfigurePointOfSaleService,
  GetEntryService,
  IdempotencyGuard,
  ListEntriesService,
  RecordEntryService,
  ReverseEntryService,
  TimeZoneResolver,
} from '../../src/application/index.js';
import { BusinessDatePolicy } from '../../src/domain/index.js';
import { FixedClock } from './fixed-clock.js';
import { ImmediateTransactionRunner } from './immediate-transaction-runner.js';
import { InMemoryEntryRepository } from './in-memory-entry-repository.js';
import { InMemoryIdempotencyStore } from './in-memory-idempotency-store.js';
import { InMemoryPointOfSaleRepository } from './in-memory-point-of-sale-repository.js';
import { SequentialIdGenerator } from './sequential-id-generator.js';
import { SAO_PAULO } from './time-zones.js';

export interface InMemoryLedger {
  readonly api: LedgerApi;
  readonly entries: InMemoryEntryRepository;
}

export const createInMemoryLedger = (now: Date): InMemoryLedger => {
  const entries = new InMemoryEntryRepository();
  const pointsOfSale = new InMemoryPointOfSaleRepository();
  const clock = new FixedClock(now);
  const idGenerator = new SequentialIdGenerator();
  const api: LedgerApi = {
    recordEntry: new RecordEntryService({
      repository: entries,
      clock,
      idGenerator,
      businessDatePolicy: new BusinessDatePolicy(30),
      timeZoneResolver: new TimeZoneResolver(pointsOfSale, SAO_PAULO),
    }),
    reverseEntry: new ReverseEntryService({ repository: entries, clock, idGenerator }),
    getEntry: new GetEntryService(entries),
    listEntries: new ListEntriesService(entries),
    configurePointOfSale: new ConfigurePointOfSaleService(pointsOfSale),
    idempotency: new IdempotencyGuard({
      store: new InMemoryIdempotencyStore(),
      transactions: new ImmediateTransactionRunner(),
    }),
  };
  return { api, entries };
};
