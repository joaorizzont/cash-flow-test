import type { EntryView } from './entry-view.js';

export interface ListEntriesQuery {
  readonly merchantId: string;
  readonly from: string;
  readonly to: string;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface EntryListView {
  readonly items: readonly EntryView[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

export interface ListEntries {
  execute(query: ListEntriesQuery): Promise<EntryListView>;
}
