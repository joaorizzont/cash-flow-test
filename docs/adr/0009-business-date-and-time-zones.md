# ADR-0009: Business date and time zones per point of sale

- **Status:** Accepted
- **Date:** 2026-10-09

## Context

A daily cash report groups entries by "day", but which day? Brazil has four time zones. A sale at 00:30 in Fernando de Noronha (UTC-2) is 23:30 of the previous day in Brasília. With a single server time zone, that sale would either land in the wrong day or be rejected as a future date. Merchants also record entries late (a sale from yesterday entered this morning). And the challenge describes a daily report, which is a business concept, not a technical timestamp.

## Decision

- Separate the **business date** (`businessDate`, the cash day the entry belongs to, `YYYY-MM-DD`) from the **recording instant** (`recordedAt`, UTC).
- Each **point of sale** is configured with an **IANA time zone** (`America/Manaus`, not `-04:00`); entries without a point of sale use a configurable default (`DEFAULT_TIME_ZONE`, `America/Sao_Paulo`).
- When the client does not send a business date, it is today in the time zone of the point of sale. Business dates cannot be in the future (in that time zone) or older than `MAX_BACKDATED_DAYS` (30).
- The time zone in effect is **stored on each entry**; local time is **derived** on read (`recordedAtLocal`), never stored.
- A reversal keeps the business date, point of sale and time zone of the original, so it corrects the right day.
- The **daily balance knows nothing about time zones**: events carry the already resolved business date.

## Alternatives considered

| Alternative                                   | Why it was not chosen                                                                          |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Group by `recordedAt` in a single time zone   | Wrong day for merchants in other zones; no way to record late entries in the right day         |
| Store UTC offsets instead of IANA names       | Offsets do not carry daylight saving rules; if DST returns, the IANA database update is enough |
| Store local time as well as UTC               | Redundant and can diverge; it is derivable from the instant and the stored zone                |
| Resolve the business date in the consolidator | Spreads time zone logic across services; the ledger is where the entry is born                 |

## Consequences

**Positive**

- Correct days for all Brazilian time zones (tests cover Noronha, Manaus and Rio Branco around midnight).
- Changing a point of sale's time zone never reinterprets past entries.
- The consolidator stays simple and time-zone agnostic.

**Negative / trade-offs**

- Clients must understand that `businessDate` and `recordedAt` can be different days.
- The backdating window is a policy decision; closing past days ("month closing") is a future evolution.

## Evidence

- Value objects: [business-date.ts](../../services/ledger/src/domain/entry/business-date.ts), [time-zone.ts](../../services/ledger/src/domain/shared/time-zone.ts), [business-date-policy.ts](../../services/ledger/src/domain/entry/business-date-policy.ts)
- Resolution of the zone: [time-zone-resolver.ts](../../services/ledger/src/application/services/time-zone-resolver.ts)
- Point of sale aggregate: [point-of-sale.ts](../../services/ledger/src/domain/point-of-sale/point-of-sale.ts)
