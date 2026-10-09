import {
  BusinessDate,
  Description,
  Entry,
  EntryId,
  MerchantId,
  Money,
  parseEntryType,
  PointOfSaleId,
  type BusinessDatePolicy,
} from '../../domain/index.js';
import { toEntryView, type EntryView } from '../ports/inbound/entry-view.js';
import type { RecordEntry, RecordEntryCommand } from '../ports/inbound/record-entry.js';
import type { Clock } from '../ports/outbound/clock.js';
import type { EntryRepository } from '../ports/outbound/entry-repository.js';
import type { IdGenerator } from '../ports/outbound/id-generator.js';
import type { TimeZoneResolver } from '../services/time-zone-resolver.js';

export interface RecordEntryDependencies {
  readonly repository: EntryRepository;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly businessDatePolicy: BusinessDatePolicy;
  readonly timeZoneResolver: TimeZoneResolver;
}

const optionalPointOfSaleId = (value: string | undefined): PointOfSaleId | null =>
  value === undefined ? null : PointOfSaleId.from(value);

const optionalBusinessDate = (value: string | undefined): BusinessDate | null =>
  value === undefined ? null : BusinessDate.from(value);

export class RecordEntryService implements RecordEntry {
  constructor(private readonly dependencies: RecordEntryDependencies) {}

  async execute(command: RecordEntryCommand): Promise<EntryView> {
    const { repository, clock, idGenerator, businessDatePolicy, timeZoneResolver } =
      this.dependencies;
    const merchantId = MerchantId.from(command.merchantId);
    const pointOfSaleId = optionalPointOfSaleId(command.pointOfSaleId);
    const type = parseEntryType(command.type);
    const amount = Money.of(command.amountInCents, command.currency);
    const description = Description.from(command.description);
    const informedBusinessDate = optionalBusinessDate(command.businessDate);

    const timeZone = await timeZoneResolver.resolve(merchantId, pointOfSaleId);
    const recordedAt = clock.now();
    const today = BusinessDate.fromInstant(recordedAt, timeZone);
    const businessDate = informedBusinessDate ?? today;
    businessDatePolicy.assertAcceptable(businessDate, today);

    const entry = Entry.record({
      id: EntryId.from(idGenerator.next()),
      merchantId,
      pointOfSaleId,
      type,
      amount,
      businessDate,
      description,
      recordedAt,
      timeZone,
    });

    await repository.save(entry);
    return toEntryView(entry);
  }
}
