import type {
  ConfigurePointOfSale,
  GetEntry,
  IdempotencyGuard,
  ListEntries,
  RecordEntry,
  ReverseEntry,
} from '../../../application/index.js';

export interface LedgerApi {
  readonly recordEntry: RecordEntry;
  readonly reverseEntry: ReverseEntry;
  readonly getEntry: GetEntry;
  readonly listEntries: ListEntries;
  readonly configurePointOfSale: ConfigurePointOfSale;
  readonly idempotency: IdempotencyGuard;
}
