import { Type } from 'typebox';

const cents = (description: string) => Type.Integer({ description });

const dailyBalanceFields = {
  businessDate: Type.String({ format: 'date' }),
  totalCreditsInCents: cents('Sum of the credits of the day'),
  totalDebitsInCents: cents('Sum of the debits of the day'),
  balanceInCents: cents('Credits minus debits of the day'),
  entryCount: Type.Integer({ description: 'Number of entries consolidated in the day' }),
  openingBalanceInCents: cents('Accumulated balance before the day'),
  closingBalanceInCents: cents('Accumulated balance at the end of the day'),
};

export const DailyBalanceLineSchema = Type.Object(dailyBalanceFields);

export const DailyBalanceSchema = Type.Object({
  merchantId: Type.String({ format: 'uuid' }),
  ...dailyBalanceFields,
  generatedAt: Type.String({ format: 'date-time' }),
});

export const BalanceReportSchema = Type.Object({
  merchantId: Type.String({ format: 'uuid' }),
  from: Type.String({ format: 'date' }),
  to: Type.String({ format: 'date' }),
  openingBalanceInCents: cents('Accumulated balance before the period'),
  closingBalanceInCents: cents('Accumulated balance at the end of the period'),
  totalCreditsInCents: cents('Sum of the credits of the period'),
  totalDebitsInCents: cents('Sum of the debits of the period'),
  netChangeInCents: cents('Credits minus debits of the period'),
  entryCount: Type.Integer({ description: 'Number of entries consolidated in the period' }),
  days: Type.Array(DailyBalanceLineSchema),
  generatedAt: Type.String({ format: 'date-time' }),
});

export const DayParamsSchema = Type.Object({
  businessDate: Type.String({ format: 'date' }),
});

export const PeriodQuerySchema = Type.Object({
  from: Type.String({ format: 'date' }),
  to: Type.String({ format: 'date' }),
});
