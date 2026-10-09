import { Description, EntryId, MerchantId, type Entry } from '../../domain/index.js';
import { EntryAlreadyReversedError } from '../errors/entry-already-reversed-error.js';
import { EntryNotFoundError } from '../errors/entry-not-found-error.js';
import { toEntryView, type EntryView } from '../ports/inbound/entry-view.js';
import type { ReverseEntry, ReverseEntryCommand } from '../ports/inbound/reverse-entry.js';
import type { Clock } from '../ports/outbound/clock.js';
import type { EntryRepository } from '../ports/outbound/entry-repository.js';
import type { IdGenerator } from '../ports/outbound/id-generator.js';

export interface ReverseEntryDependencies {
  readonly repository: EntryRepository;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
}

const defaultReasonFor = (entryId: EntryId): string => `Reversal of entry ${entryId.value}`;

export class ReverseEntryService implements ReverseEntry {
  constructor(private readonly dependencies: ReverseEntryDependencies) {}

  async execute(command: ReverseEntryCommand): Promise<EntryView> {
    const { repository, clock, idGenerator } = this.dependencies;
    const merchantId = MerchantId.from(command.merchantId);
    const entryId = EntryId.from(command.entryId);

    const original = await this.findReversibleEntry(merchantId, entryId);
    const reversal = original.reverse({
      id: EntryId.from(idGenerator.next()),
      description: Description.from(command.reason ?? defaultReasonFor(entryId)),
      recordedAt: clock.now(),
    });

    await repository.save(reversal);
    return toEntryView(reversal);
  }

  private async findReversibleEntry(merchantId: MerchantId, entryId: EntryId): Promise<Entry> {
    const { repository } = this.dependencies;
    const original = await repository.findById(merchantId, entryId);
    if (original === null) {
      throw new EntryNotFoundError(entryId.value);
    }
    if (await repository.hasReversal(merchantId, entryId)) {
      throw new EntryAlreadyReversedError(entryId.value);
    }
    return original;
  }
}
