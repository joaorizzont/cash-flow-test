import { Type, type Static } from 'typebox';
import { Compile } from 'typebox/compile';
import { cloudEventSchema } from '../cloud-event.js';

export const LEDGER_EVENTS_EXCHANGE = 'cash-flow.ledger.events';
export const LEDGER_EVENT_SOURCE = '/cash-flow/ledger';
export const LEDGER_ENTRY_EVENTS_BINDING = 'cashflow.ledger.entry.*.v1';

export const ENTRY_RECORDED_V1 = 'cashflow.ledger.entry.recorded.v1';
export const ENTRY_REVERSED_V1 = 'cashflow.ledger.entry.reversed.v1';

const entryData = {
  entryId: Type.String({ format: 'uuid' }),
  merchantId: Type.String({ format: 'uuid' }),
  pointOfSaleId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  entryType: Type.Union([Type.Literal('CREDIT'), Type.Literal('DEBIT')]),
  amountInCents: Type.Integer({ minimum: 1 }),
  currency: Type.Literal('BRL'),
  businessDate: Type.String({ format: 'date' }),
};

export const EntryRecordedDataV1 = Type.Object(entryData, { additionalProperties: false });

export const EntryReversedDataV1 = Type.Object(
  { ...entryData, reversedEntryId: Type.String({ format: 'uuid' }) },
  { additionalProperties: false },
);

export const EntryRecordedV1 = cloudEventSchema(ENTRY_RECORDED_V1, EntryRecordedDataV1);
export const EntryReversedV1 = cloudEventSchema(ENTRY_REVERSED_V1, EntryReversedDataV1);
export const LedgerEventV1 = Type.Union([EntryRecordedV1, EntryReversedV1]);

export type EntryRecordedDataV1 = Static<typeof EntryRecordedDataV1>;
export type EntryReversedDataV1 = Static<typeof EntryReversedDataV1>;
export type EntryRecordedV1 = Static<typeof EntryRecordedV1>;
export type EntryReversedV1 = Static<typeof EntryReversedV1>;
export type LedgerEventV1 = Static<typeof LedgerEventV1>;

const ledgerEventValidator = Compile(LedgerEventV1);

export const isLedgerEventV1 = (value: unknown): value is LedgerEventV1 =>
  ledgerEventValidator.Check(value);

export const describeLedgerEventErrors = (value: unknown): readonly string[] =>
  [...ledgerEventValidator.Errors(value)].map((error) => `${error.instancePath} ${error.message}`);
