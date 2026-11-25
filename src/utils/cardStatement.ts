import type { FinanceDataStore } from '../domain/financeRules';
import type { CardInternalItem, UnifiedMonthlyAccount } from '../types/finance';
import { purchases } from '../data/october2026CardPurchases';
import { entryMetadata, compareCreatedAt } from './entryOrigins';

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt-BR');
const validDate = (value: string | undefined) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : undefined;
};

function confirmedPurchaseDate(item: CardInternalItem, cardId: string, store: FinanceDataStore): string | undefined {
  if (item.sourceType === 'installment') {
    const source = store.installmentPurchases.find(purchase => purchase.id === item.sourceId);
    // The October importer preserved the supplied date explicitly in notes.
    return validDate(source?.notes?.match(/(?:^|\n)Data do lançamento: (\d{4}-\d{2}-\d{2})(?:\s|$)/)?.[1]);
  }

  const source = store.cardExpenses.find(expense => expense.id === item.sourceId && expense.cardId === cardId);
  if (!source || source.month !== '2026-10') return undefined;
  // Simple expenses have no notes/date field. Recover only a date from the
  // owner's confirmed import list, corroborated by the exact imported record.
  // An arbitrary record's creation timestamp is never used as its purchase date.
  const confirmed = purchases.filter(purchase => !purchase.total && purchase.day
    && normalize(purchase.name) === normalize(source.description)
    && purchase.cents === Math.round(source.amount * 100));
  if (confirmed.length !== 1) return undefined;
  const date = `2026-10-${String(confirmed[0].day).padStart(2, '0')}`;
  const candidates = store.cardExpenses.filter(expense => expense.cardId === cardId && expense.month === source.month
    && normalize(expense.description) === normalize(source.description) && expense.amount === source.amount
    && new Date(expense.createdAt).getTime() === Date.parse(`${date}T12:00:00-03:00`));
  return candidates.length === 1 && candidates[0].id === source.id ? date : undefined;
}

export function cardStatementRows(account: UnifiedMonthlyAccount, store: FinanceDataStore) {
  const cardId = account.cardInfo?.cardId ?? account.id;
  return (account.cardInfo?.items ?? []).map(item => ({ item, purchaseDate: confirmedPurchaseDate(item, cardId, store) }))
    .sort((a, b) => (b.purchaseDate ?? '').localeCompare(a.purchaseDate ?? ''));
}

export function formatPurchaseDate(date: string | undefined) {
  return date ? date.split('-').reverse().join('/') : 'Data não informada';
}

export type StatementSort = 'default' | 'newest' | 'oldest' | 'highest' | 'lowest' | 'name';
export function filterStatementRows(account: UnifiedMonthlyAccount, store: FinanceDataStore, filters: {
  search: string; category: string; author: string; type: string; sort: StatementSort;
}) {
  const query = normalize(filters.search);
  return cardStatementRows(account, store).filter(({ item }) => {
    const meta = entryMetadata(store, item.sourceType, item.sourceId);
    return normalize(item.description).includes(query)
      && (filters.category === 'all' || (item.categoryId ?? 'unknown') === filters.category)
      && (filters.author === 'all' || (meta.authorId ?? 'unknown') === filters.author)
      && (filters.type === 'all' || (item.isInstallment ? 'installment' : 'simple_expense') === filters.type);
  }).sort((a, b) => {
    if (filters.sort === 'newest' || filters.sort === 'oldest') return compareCreatedAt(
      entryMetadata(store, a.item.sourceType, a.item.sourceId).createdAt,
      entryMetadata(store, b.item.sourceType, b.item.sourceId).createdAt, filters.sort);
    if (filters.sort === 'highest') return b.item.amount - a.item.amount;
    if (filters.sort === 'lowest') return a.item.amount - b.item.amount;
    if (filters.sort === 'name') return a.item.description.localeCompare(b.item.description, 'pt-BR');
    return 0;
  });
}
