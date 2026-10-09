import { BusinessDate, MerchantId, ValidationError } from '../../domain/index.js';
import { toEntryView } from '../ports/inbound/entry-view.js';
import type {
  EntryListView,
  ListEntries,
  ListEntriesQuery,
} from '../ports/inbound/list-entries.js';
import type { EntryRepository } from '../ports/outbound/entry-repository.js';

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;
export const MAX_PERIOD_IN_DAYS = 92;

const assertPositiveInteger = (value: number, label: string): void => {
  if (!Number.isInteger(value) || value < 1) {
    throw new ValidationError(`${label} must be a positive integer`);
  }
};

const assertPagination = (page: number, pageSize: number): void => {
  assertPositiveInteger(page, 'Page');
  assertPositiveInteger(pageSize, 'Page size');
  if (pageSize > MAX_PAGE_SIZE) {
    throw new ValidationError(`Page size must not exceed ${MAX_PAGE_SIZE}`);
  }
};

const assertPeriod = (from: BusinessDate, to: BusinessDate): void => {
  if (from.isAfter(to)) {
    throw new ValidationError('Period start must not be after period end');
  }
  if (from.daysUntil(to) > MAX_PERIOD_IN_DAYS) {
    throw new ValidationError(`Period must not exceed ${MAX_PERIOD_IN_DAYS} days`);
  }
};

export class ListEntriesService implements ListEntries {
  constructor(private readonly repository: EntryRepository) {}

  async execute(query: ListEntriesQuery): Promise<EntryListView> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const from = BusinessDate.from(query.from);
    const to = BusinessDate.from(query.to);
    assertPagination(page, pageSize);
    assertPeriod(from, to);

    const result = await this.repository.findByPeriod({
      merchantId: MerchantId.from(query.merchantId),
      from,
      to,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });

    return { items: result.items.map(toEntryView), page, pageSize, total: result.total };
  }
}
