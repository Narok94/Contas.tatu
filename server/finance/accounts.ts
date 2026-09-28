import { randomUUID } from 'node:crypto';
import type { FinanceDataStore } from '../../src/domain/financeRules.js';
import { assertMonthOpen } from '../../src/domain/monthOperations.js';
import { find, keys, money, ref, text } from './validation.js';

export function accountCommand(s: FinanceDataStore, action: string, m: string, d: Record<string, unknown>) {
  const now = new Date().toISOString();
  if (action === 'simple.create' || action === 'simple.edit') {
    keys(d, ['id', 'name', 'value', 'categoryId', 'notes']);
    const old = action.endsWith('edit') ? find(s.simpleAccounts, d.id) : undefined;
    if (old) assertMonthOpen(s, old.month);
    const row = { id: old?.id ?? randomUUID(), name: text(d.name)!, value: money(d.value),
      categoryId: ref(d.categoryId, s.categories), notes: text(d.notes, true),
      month: old?.month ?? m, status: old?.status ?? 'pendente' as const, createdAt: old?.createdAt ?? now };
    s.simpleAccounts = old ? s.simpleAccounts.map(a => a.id === row.id ? row : a) : [row, ...s.simpleAccounts];
  } else if (action === 'simple.archive') {
    keys(d, ['id']); const row = find(s.simpleAccounts, d.id); assertMonthOpen(s, row.month);
    s.simpleAccounts = s.simpleAccounts.filter(a => a.id !== row.id);
  } else if (action === 'recurring.create') {
    keys(d, ['name', 'initialValue', 'categoryId', 'notes']); const id = randomUUID(); const value = money(d.initialValue);
    s.recurringDefinitions.push({ id, name: text(d.name)!, startMonth: m, isActive: true,
      categoryId: ref(d.categoryId, s.categories), notes: text(d.notes, true), createdAt: now });
    s.recurringMonthlyRecords.push({ id: randomUUID(), definitionId: id, month: m, value, isValueSet: value > 0, status: 'pendente' });
  } else if (action === 'recurring.edit') {
    keys(d, ['id', 'name', 'value', 'categoryId', 'notes']); const row = find(s.recurringDefinitions, d.id);
    if (m < row.startMonth) throw new Error('Recurring month precedes start');
    Object.assign(row, { name: text(d.name)!, categoryId: ref(d.categoryId, s.categories), notes: text(d.notes, true) });
    const old = s.recurringMonthlyRecords.find(r => r.definitionId === row.id && r.month === m);
    const record = { ...old, id: old?.id ?? randomUUID(), definitionId: row.id, month: m,
      value: money(d.value), isValueSet: true, status: old?.status ?? 'pendente' as const };
    s.recurringMonthlyRecords = [...s.recurringMonthlyRecords.filter(r => r !== old), record];
  } else if (action === 'recurring.archive') {
    keys(d, ['id']); const row = find(s.recurringDefinitions, d.id);
    s.recurringDefinitions = s.recurringDefinitions.filter(r => r.id !== row.id);
    s.recurringMonthlyRecords = s.recurringMonthlyRecords.filter(r => r.definitionId !== row.id);
  } else return false;
  return true;
}
