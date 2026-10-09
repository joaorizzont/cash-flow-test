import type { BusinessDate, Entry, EntryId, MerchantId } from '../../../domain/index.js';

export interface EntryPeriodQuery {
  readonly merchantId: MerchantId;
  readonly from: BusinessDate;
  readonly to: BusinessDate;
  readonly limit: number;
  readonly offset: number;
}

export interface EntryPage {
  readonly items: readonly Entry[];
  readonly total: number;
}

export interface EntryRepository {
  save(entry: Entry): Promise<void>;
  findById(merchantId: MerchantId, id: EntryId): Promise<Entry | null>;
  hasReversal(merchantId: MerchantId, id: EntryId): Promise<boolean>;
  findByPeriod(query: EntryPeriodQuery): Promise<EntryPage>;
}
