import type { FinanceDataStore } from '../domain/financeRules';
import type { EntryOrigin, UnifiedMonthlyAccount } from '../types/finance';

export type EntryType = EntryOrigin['entryType'];
export function entryMetadata(store: FinanceDataStore, type: EntryType, id: string) {
  const origin = store.entryOrigins?.find(row => row.entryType === type && row.entryId === id);
  const sources = { simple: store.simpleAccounts, recurring: store.recurringDefinitions, installment: store.installmentPurchases, credit_card: store.creditCards, simple_expense: store.cardExpenses };
  return { authorId: origin?.actorId, authorName: origin?.actorName, createdAt: origin?.createdAt ?? sources[type].find(row => row.id === id)?.createdAt };
}
export function accountMetadata(store: FinanceDataStore, account: UnifiedMonthlyAccount) {
  return entryMetadata(store, account.type, account.recurringInfo?.definitionId ?? account.installmentInfo?.purchaseId ?? account.cardInfo?.cardId ?? account.id);
}
export function compareCreatedAt(a: string | undefined, b: string | undefined, order: 'newest' | 'oldest') {
  const left = a ? Date.parse(a) : NaN, right = b ? Date.parse(b) : NaN;
  // Unknown dates always follow dated entries, regardless of direction.
  if (!Number.isFinite(left)) return Number.isFinite(right) ? 1 : 0;
  if (!Number.isFinite(right)) return -1;
  return order === 'newest' ? right - left : left - right;
}
export function entryAuthors(store: FinanceDataStore) {
  return [...new Map((store.entryOrigins ?? []).map(row => [row.actorId, row.actorName])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
}
