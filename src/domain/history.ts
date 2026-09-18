import { computeFinancialSummary, FinanceDataStore } from './financeRules';

/** Sum each month's own expenses once. Card items and previous balances are not added again.
 * Closed months use their official snapshot; open months use current registered occurrences.
 * Recurring definitions without a monthly value contribute zero; installments follow their schedule.
 */
export function computeAnnualHistory(year: number, store: FinanceDataStore) {
  const months = Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, '0')}`;
    const summary = computeFinancialSummary(month, store);
    return { month, total: summary.totalExpected, closed: Boolean(store.closedMonths?.[month]) };
  });
  return { months, total: months.reduce((cents, month) => cents + Math.round(month.total * 100), 0) / 100 };
}
