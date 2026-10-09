import type { EntryView } from './entry-view.js';

export interface ReverseEntryCommand {
  readonly merchantId: string;
  readonly entryId: string;
  readonly reason?: string;
}

export interface ReverseEntry {
  execute(command: ReverseEntryCommand): Promise<EntryView>;
}
