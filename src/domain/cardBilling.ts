import { computeMonthlyAccounts, type FinanceDataStore } from './financeRules.js';
import { addMonths } from '../utils/formatters.js';

/** New purchases belong to the first unpaid invoice; existing purchases keep their dates. */
export function cardPurchaseMonth(store: FinanceDataStore, cardId: string | undefined, month: string): string {
  if (!cardId) return month;
  let target = month;
  while (computeMonthlyAccounts(target, store).some(account =>
    account.type === 'credit_card' && account.id === cardId && account.status === 'pago')) {
    const next = addMonths(target, 1);
    if (!/^\d{4}-\d{2}$/.test(next) || next <= target) throw new Error('Billing month outside supported range');
    target = next;
  }
  return target;
}
