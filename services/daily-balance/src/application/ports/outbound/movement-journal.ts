import type { BusinessDate, MerchantId, Movement } from '../../../domain/index.js';

export interface JournalRecord {
  readonly eventId: string;
  readonly eventType: string;
  readonly occurredAt: Date;
  readonly movement: Movement;
}

export interface MovementJournal {
  append(record: JournalRecord): Promise<boolean>;
  movementsOf(merchantId: MerchantId, businessDate: BusinessDate): Promise<readonly Movement[]>;
}
