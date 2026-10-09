import type { MerchantId } from '../shared/merchant-id.js';
import type { BusinessDate } from './business-date.js';
import type { EntryId } from './entry-id.js';
import type { EntryType } from './entry-type.js';
import type { Money } from './money.js';

export interface Movement {
  readonly entryId: EntryId;
  readonly merchantId: MerchantId;
  readonly businessDate: BusinessDate;
  readonly type: EntryType;
  readonly amount: Money;
}
