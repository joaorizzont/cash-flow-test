import { ValidationError } from '../shared/validation-error.js';

export const EntryType = {
  CREDIT: 'CREDIT',
  DEBIT: 'DEBIT',
} as const;

export type EntryType = (typeof EntryType)[keyof typeof EntryType];

const ENTRY_TYPES: readonly string[] = Object.values(EntryType);

const isEntryType = (value: string): value is EntryType => ENTRY_TYPES.includes(value);

export const parseEntryType = (value: string): EntryType => {
  if (!isEntryType(value)) {
    throw new ValidationError(`Invalid entry type: ${value}`);
  }
  return value;
};

export const oppositeOf = (type: EntryType): EntryType =>
  type === EntryType.CREDIT ? EntryType.DEBIT : EntryType.CREDIT;
