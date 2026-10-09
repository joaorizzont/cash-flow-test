import {
  BusinessDate,
  DailyBalance,
  EntryId,
  MerchantId,
  Money,
  parseEntryType,
  type Movement,
} from '../../domain/index.js';
import {
  ConsolidationResult,
  type ConsolidateMovement,
  type ConsolidateMovementCommand,
} from '../ports/inbound/consolidate-movement.js';
import type { DailyBalanceRepository } from '../ports/outbound/daily-balance-repository.js';
import type { MovementJournal } from '../ports/outbound/movement-journal.js';
import type { TransactionRunner } from '../ports/outbound/transaction-runner.js';

export interface ConsolidateMovementDependencies {
  readonly journal: MovementJournal;
  readonly balances: DailyBalanceRepository;
  readonly transactions: TransactionRunner;
}

const movementOf = (command: ConsolidateMovementCommand): Movement => ({
  entryId: EntryId.from(command.entryId),
  merchantId: MerchantId.from(command.merchantId),
  businessDate: BusinessDate.from(command.businessDate),
  type: parseEntryType(command.entryType),
  amount: Money.of(command.amountInCents, command.currency),
});

export class ConsolidateMovementService implements ConsolidateMovement {
  constructor(private readonly dependencies: ConsolidateMovementDependencies) {}

  async execute(command: ConsolidateMovementCommand): Promise<ConsolidationResult> {
    const movement = movementOf(command);
    const delta = DailyBalance.of(movement);
    const { journal, balances, transactions } = this.dependencies;

    return transactions.run(async () => {
      const isFirstDelivery = await journal.append({
        eventId: command.eventId,
        eventType: command.eventType,
        occurredAt: command.occurredAt,
        movement,
      });
      if (!isFirstDelivery) {
        return ConsolidationResult.DUPLICATE;
      }
      await balances.accumulate(delta);
      return ConsolidationResult.APPLIED;
    });
  }
}
