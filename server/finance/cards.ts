import { randomUUID } from 'node:crypto';
import type { FinanceDataStore } from '../../src/domain/financeRules.js';
import { assertMonthOpen } from '../../src/domain/monthOperations.js';
import { find, keys, money, ref, text } from './validation.js';

export function cardCommand(s: FinanceDataStore, action: string, m: string, d: Record<string, unknown>) {
  if (action === 'card.create' || action === 'card.edit') {
    keys(d, ['id', 'name', 'brand', 'color']);
    const old = action.endsWith('edit') ? find(s.creditCards, d.id) : undefined;
    const row = { id: old?.id ?? randomUUID(), name: text(d.name)!, brand: text(d.brand, true),
      color: text(d.color, true), createdAt: old?.createdAt ?? new Date().toISOString() };
    s.creditCards = old ? s.creditCards.map(c => c.id === row.id ? row : c) : [...s.creditCards, row];
  } else if (action === 'card.archive') {
    keys(d, ['id']); const row = find(s.creditCards, d.id);
    if (s.installmentPurchases.some(p => p.versions?.some(v => v.creditCardId === row.id))) throw new Error('Card has version history');
    s.creditCards = s.creditCards.filter(c => c.id !== row.id);
    s.cardExpenses = s.cardExpenses.filter(e => e.cardId !== row.id);
    s.cardMonthlyInvoices = s.cardMonthlyInvoices.filter(i => i.cardId !== row.id);
  } else if (action === 'expense.create' || action === 'expense.edit') {
    keys(d, ['id', 'cardId', 'description', 'amount', 'categoryId']);
    const old = action.endsWith('edit') ? find(s.cardExpenses, d.id) : undefined;
    if (old) assertMonthOpen(s, old.month);
    const cardId = old?.cardId ?? find(s.creditCards, d.cardId).id;
    const row = { id: old?.id ?? randomUUID(), cardId, description: text(d.description)!, amount: money(d.amount),
      categoryId: ref(d.categoryId, s.categories), month: old?.month ?? m, createdAt: old?.createdAt ?? new Date().toISOString() };
    s.cardExpenses = old ? s.cardExpenses.map(e => e.id === row.id ? row : e) : [...s.cardExpenses, row];
  } else if (action === 'expense.archive') {
    keys(d, ['id']); const row = find(s.cardExpenses, d.id); assertMonthOpen(s, row.month);
    s.cardExpenses = s.cardExpenses.filter(e => e.id !== row.id);
  } else return false;
  return true;
}
