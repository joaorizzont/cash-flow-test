import type { EntryView } from './entry-view.js';

export interface GetEntryQuery {
  readonly merchantId: string;
  readonly entryId: string;
}

export interface GetEntry {
  execute(query: GetEntryQuery): Promise<EntryView>;
}
