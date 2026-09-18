import { computeFinancialSummary, FinanceDataStore, getInstallmentStatusForMonth } from './financeRules';

/** Sum each month's paid expenses once. Card items and previous balances are not added again.
 * Closed months use their official snapshot; open months use current registered occurrences.
 * Recurring definitions without a monthly value contribute zero; installments follow their schedule.
 */
export function computeAnnualHistory(year: number, store: FinanceDataStore) {
  const months = Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, '0')}`;
    const summary = computeFinancialSummary(month, store);
    return { month, total: summary.totalPaid, closed: Boolean(store.closedMonths?.[month]) };
  });
  return { months, total: months.reduce((cents, month) => cents + Math.round(month.total * 100), 0) / 100 };
}

/** Current installment purchases only, never invoice aggregators or guessed schedules. */
export function computeActiveInstallments(month: string, store: FinanceDataStore) {
  return store.installmentPurchases.flatMap(purchase => {
    const validMonth = (value: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
    if (!validMonth(purchase.effectiveFromMonth || purchase.startMonth) ||
      !Number.isInteger(purchase.installmentsCount) || purchase.installmentsCount < 1 ||
      !Number.isFinite(purchase.totalAmount) || purchase.totalAmount < 0 ||
      (purchase.creditCardId && !store.creditCards.some(card => card.id === purchase.creditCardId))) return [];
    const status = getInstallmentStatusForMonth(purchase, month);
    if (!status.isActive || !validMonth(status.endMonth) || status.endMonth < month ||
      !Number.isInteger(status.currentInstallment) || status.currentInstallment < 1 ||
      !Number.isInteger(status.totalInstallments) || status.currentInstallment > status.totalInstallments ||
      !Number.isFinite(status.installmentAmount) || status.installmentAmount < 0) return [];
    return [{ id: purchase.id, name: status.description || purchase.description,
      current: status.currentInstallment, total: status.totalInstallments,
      amount: status.installmentAmount, endMonth: status.endMonth }];
  }).sort((a, b) => a.endMonth.localeCompare(b.endMonth) || a.name.localeCompare(b.name));
}
