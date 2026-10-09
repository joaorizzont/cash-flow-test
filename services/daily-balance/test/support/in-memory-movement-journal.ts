import type { JournalRecord, MovementJournal } from '../../src/application/index.js';
import type { BusinessDate, MerchantId, Movement } from '../../src/domain/index.js';

export class InMemoryMovementJournal implements MovementJournal {
  readonly records: JournalRecord[] = [];

  async append(record: JournalRecord): Promise<boolean> {
    const isDuplicate = this.records.some(
      (existing) =>
        existing.eventId === record.eventId ||
        existing.movement.entryId.equals(record.movement.entryId),
    );
    if (isDuplicate) {
      return false;
    }
    this.records.push(record);
    return true;
  }

  async movementsOf(
    merchantId: MerchantId,
    businessDate: BusinessDate,
  ): Promise<readonly Movement[]> {
    return this.records
      .map((record) => record.movement)
      .filter(
        (movement) =>
          movement.merchantId.equals(merchantId) && movement.businessDate.equals(businessDate),
      );
  }
}
