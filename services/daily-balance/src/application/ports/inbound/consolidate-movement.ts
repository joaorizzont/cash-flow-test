export interface ConsolidateMovementCommand {
  readonly eventId: string;
  readonly eventType: string;
  readonly occurredAt: Date;
  readonly entryId: string;
  readonly merchantId: string;
  readonly businessDate: string;
  readonly entryType: string;
  readonly amountInCents: number;
  readonly currency: string;
}

export const ConsolidationResult = {
  APPLIED: 'APPLIED',
  DUPLICATE: 'DUPLICATE',
} as const;

export type ConsolidationResult = (typeof ConsolidationResult)[keyof typeof ConsolidationResult];

export interface ConsolidateMovement {
  execute(command: ConsolidateMovementCommand): Promise<ConsolidationResult>;
}
