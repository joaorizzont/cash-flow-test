import type { EntryView } from './entry-view.js';

export interface RecordEntryCommand {
  readonly merchantId: string;
  readonly type: string;
  readonly amountInCents: number;
  readonly currency?: string;
  readonly businessDate: string;
  readonly description: string;
}

export interface RecordEntry {
  execute(command: RecordEntryCommand): Promise<EntryView>;
}
