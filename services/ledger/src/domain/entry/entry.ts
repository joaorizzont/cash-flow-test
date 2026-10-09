import { AggregateRoot } from '../shared/aggregate-root.js';
import type { BusinessDate } from './business-date.js';
import type { Description } from './description.js';
import { ReversalOfReversalError } from './entry-errors.js';
import type { EntryEvent } from './entry-events.js';
import type { EntryId } from './entry-id.js';
import { oppositeOf, type EntryType } from './entry-type.js';
import type { MerchantId } from './merchant-id.js';
import type { Money } from './money.js';

export interface EntryProps {
  readonly id: EntryId;
  readonly merchantId: MerchantId;
  readonly type: EntryType;
  readonly amount: Money;
  readonly businessDate: BusinessDate;
  readonly description: Description;
  readonly reversalOf: EntryId | null;
  readonly recordedAt: Date;
}

export type NewEntryProps = Omit<EntryProps, 'reversalOf'>;

export interface ReversalProps {
  readonly id: EntryId;
  readonly description: Description;
  readonly recordedAt: Date;
}

export class Entry extends AggregateRoot<EntryEvent> {
  private constructor(private readonly props: EntryProps) {
    super();
  }

  static record(props: NewEntryProps): Entry {
    const entry = new Entry({ ...props, reversalOf: null });
    entry.addDomainEvent({ name: 'EntryRecorded', ...entry.eventPayload() });
    return entry;
  }

  static restore(props: EntryProps): Entry {
    return new Entry(props);
  }

  reverse(props: ReversalProps): Entry {
    if (this.isReversal()) {
      throw new ReversalOfReversalError(this.id);
    }
    const reversal = new Entry({
      ...props,
      merchantId: this.merchantId,
      type: oppositeOf(this.type),
      amount: this.amount,
      businessDate: this.businessDate,
      reversalOf: this.id,
    });
    reversal.addDomainEvent({
      name: 'EntryReversed',
      reversedEntryId: this.id.value,
      ...reversal.eventPayload(),
    });
    return reversal;
  }

  isReversal(): boolean {
    return this.props.reversalOf !== null;
  }

  get id(): EntryId {
    return this.props.id;
  }

  get merchantId(): MerchantId {
    return this.props.merchantId;
  }

  get type(): EntryType {
    return this.props.type;
  }

  get amount(): Money {
    return this.props.amount;
  }

  get businessDate(): BusinessDate {
    return this.props.businessDate;
  }

  get description(): Description {
    return this.props.description;
  }

  get reversalOf(): EntryId | null {
    return this.props.reversalOf;
  }

  get recordedAt(): Date {
    return this.props.recordedAt;
  }

  private eventPayload() {
    return {
      entryId: this.id.value,
      merchantId: this.merchantId.value,
      entryType: this.type,
      amountInCents: this.amount.cents,
      currency: this.amount.currency,
      businessDate: this.businessDate.value,
      occurredAt: this.recordedAt,
    };
  }
}
