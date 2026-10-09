import type { LedgerEventV1 } from '@cash-flow/contracts';
import type { ConsolidateMovementCommand } from '../../../application/index.js';

export const toConsolidateMovementCommand = (event: LedgerEventV1): ConsolidateMovementCommand => ({
  eventId: event.id,
  eventType: event.type,
  occurredAt: new Date(event.time),
  entryId: event.data.entryId,
  merchantId: event.data.merchantId,
  businessDate: event.data.businessDate,
  entryType: event.data.entryType,
  amountInCents: event.data.amountInCents,
  currency: event.data.currency,
});
