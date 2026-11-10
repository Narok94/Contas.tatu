import type { FinanceDataStore } from './financeRules';
import { computeMonthlyAccounts } from './financeRules';
import { addMonths } from '../utils/formatters';

/** Uses the same versioned schedules and closed-month snapshots as the accounts view. */
export function computeDesktopInsights(month: string, store: FinanceDataStore) {
  const installments = (target: string) => {
    const items = new Map<string, number>();
    for (const account of computeMonthlyAccounts(target, store)) {
      if (account.installmentInfo) items.set(account.installmentInfo.purchaseId, Math.round(account.amount * 100));
      for (const item of account.cardInfo?.items ?? []) {
        if (item.installmentInfo) items.set(item.installmentInfo.purchaseId, Math.round(item.amount * 100));
      }
    }
    return items;
  };
  const current = installments(month), next = installments(addMonths(month, 1));
  const ending = [...current].filter(([id]) => !next.has(id));
  const sum = (values: Iterable<number>) => [...values].reduce((total, value) => total + value, 0);
  return {
    endingCount: ending.length,
    releasedAmount: sum(ending.map(([, amount]) => amount)) / 100,
    continuingCount: [...current.keys()].filter(id => next.has(id)).length,
    reduction: (sum(current.values()) - sum(next.values())) / 100,
  };
}
