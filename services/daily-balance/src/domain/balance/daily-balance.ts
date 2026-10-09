import type { MerchantId } from '../shared/merchant-id.js';
import { BalanceOverflowError, MovementOutOfScopeError } from './balance-errors.js';
import type { BusinessDate } from './business-date.js';
import { EntryType } from './entry-type.js';
import type { Movement } from './movement.js';

export interface DailyBalanceProps {
  readonly merchantId: MerchantId;
  readonly businessDate: BusinessDate;
  readonly totalCreditsInCents: number;
  readonly totalDebitsInCents: number;
  readonly entryCount: number;
}

export class DailyBalance {
  private constructor(private readonly props: DailyBalanceProps) {}

  static empty(merchantId: MerchantId, businessDate: BusinessDate): DailyBalance {
    return new DailyBalance({
      merchantId,
      businessDate,
      totalCreditsInCents: 0,
      totalDebitsInCents: 0,
      entryCount: 0,
    });
  }

  static of(movement: Movement): DailyBalance {
    return DailyBalance.empty(movement.merchantId, movement.businessDate).apply(movement);
  }

  static fromMovements(
    merchantId: MerchantId,
    businessDate: BusinessDate,
    movements: readonly Movement[],
  ): DailyBalance {
    return movements.reduce(
      (balance, movement) => balance.apply(movement),
      DailyBalance.empty(merchantId, businessDate),
    );
  }

  static restore(props: DailyBalanceProps): DailyBalance {
    return new DailyBalance(props);
  }

  get merchantId(): MerchantId {
    return this.props.merchantId;
  }

  get businessDate(): BusinessDate {
    return this.props.businessDate;
  }

  get totalCreditsInCents(): number {
    return this.props.totalCreditsInCents;
  }

  get totalDebitsInCents(): number {
    return this.props.totalDebitsInCents;
  }

  get entryCount(): number {
    return this.props.entryCount;
  }

  get balanceInCents(): number {
    return this.props.totalCreditsInCents - this.props.totalDebitsInCents;
  }

  apply(movement: Movement): DailyBalance {
    this.ensureInScope(movement);
    const isCredit = movement.type === EntryType.CREDIT;
    return this.withTotals({
      ...this.props,
      totalCreditsInCents: this.props.totalCreditsInCents + (isCredit ? movement.amount.cents : 0),
      totalDebitsInCents: this.props.totalDebitsInCents + (isCredit ? 0 : movement.amount.cents),
      entryCount: this.props.entryCount + 1,
    });
  }

  private ensureInScope(movement: Movement): void {
    const sameMerchant = movement.merchantId.equals(this.props.merchantId);
    const sameDate = movement.businessDate.equals(this.props.businessDate);
    if (!sameMerchant || !sameDate) {
      throw new MovementOutOfScopeError(movement.entryId.value, this.scope());
    }
  }

  private withTotals(props: DailyBalanceProps): DailyBalance {
    const totals = [props.totalCreditsInCents, props.totalDebitsInCents];
    if (!totals.every((total) => Number.isSafeInteger(total))) {
      throw new BalanceOverflowError(this.scope());
    }
    return new DailyBalance(props);
  }

  private scope(): string {
    return `${this.props.merchantId.value}/${this.props.businessDate.value}`;
  }
}
