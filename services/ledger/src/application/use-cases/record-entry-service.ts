import {
  BusinessDate,
  Description,
  Entry,
  EntryId,
  MerchantId,
  Money,
  parseEntryType,
  type BusinessDatePolicy,
} from '../../domain/index.js';
import { toEntryView, type EntryView } from '../ports/inbound/entry-view.js';
import type { RecordEntry, RecordEntryCommand } from '../ports/inbound/record-entry.js';
import type { Clock } from '../ports/outbound/clock.js';
import type { EntryRepository } from '../ports/outbound/entry-repository.js';
import type { IdGenerator } from '../ports/outbound/id-generator.js';

export interface RecordEntryDependencies {
  readonly repository: EntryRepository;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly businessDatePolicy: BusinessDatePolicy;
}

export class RecordEntryService implements RecordEntry {
  constructor(private readonly dependencies: RecordEntryDependencies) {}

  async execute(command: RecordEntryCommand): Promise<EntryView> {
    const { repository, clock, idGenerator, businessDatePolicy } = this.dependencies;
    const businessDate = BusinessDate.from(command.businessDate);
    businessDatePolicy.assertAcceptable(businessDate, clock.today());

    const entry = Entry.record({
      id: EntryId.from(idGenerator.next()),
      merchantId: MerchantId.from(command.merchantId),
      type: parseEntryType(command.type),
      amount: Money.of(command.amountInCents, command.currency),
      businessDate,
      description: Description.from(command.description),
      recordedAt: clock.now(),
    });

    await repository.save(entry);
    return toEntryView(entry);
  }
}
