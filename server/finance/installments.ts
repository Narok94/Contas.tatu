import { randomUUID } from 'node:crypto';
import type { FinanceDataStore } from '../../src/domain/financeRules.js';
import { initialInstallmentVersion, getInstallmentStatusForMonth } from '../../src/domain/installmentTimeline.js';
import { changeInstallmentFromMonth, correctInstallmentMonth, cancelInstallmentFromMonth, payoffInstallment } from '../../src/domain/installmentOperations.js';
import { find, integer, keys, money, ref, text } from './validation.js';

export function installmentCommand(s: FinanceDataStore, action: string, m: string, d: Record<string, unknown>): FinanceDataStore | undefined {
  if (action === 'installment.create') {
    keys(d, ['description', 'totalAmount', 'installmentsCount', 'categoryId', 'creditCardId', 'notes']);
    const p = { id: randomUUID(), description: text(d.description)!, totalAmount: money(d.totalAmount),
      installmentsCount: integer(d.installmentsCount), startMonth: m, creditCardId: ref(d.creditCardId, s.creditCards),
      categoryId: ref(d.categoryId, s.categories), notes: text(d.notes, true), createdAt: new Date().toISOString() };
    if (!getInstallmentStatusForMonth(p, m).endMonth) throw new Error('Schedule outside supported date range');
    s.installmentPurchases.push({ ...p, versions: [{ ...initialInstallmentVersion(p), recordedAt: p.createdAt, reason: 'Criação do parcelamento' }] });
    return s;
  }
  if (action === 'installment.change' || action === 'installment.correct') {
    keys(d, ['id', 'description', 'totalAmount', 'installmentsCount', 'currentInstallment', 'categoryId', 'creditCardId', 'reason']);
    const id = find(s.installmentPurchases, d.id).id;
    const data = { description: text(d.description)!, totalAmount: money(d.totalAmount), installmentsCount: integer(d.installmentsCount),
      currentInstallment: integer(d.currentInstallment), categoryId: ref(d.categoryId, s.categories),
      creditCardId: d.creditCardId === undefined ? undefined : ref(d.creditCardId, s.creditCards) ?? '' };
    return (action.endsWith('correct') ? correctInstallmentMonth : changeInstallmentFromMonth)(s, id, m, data, text(d.reason)!);
  }
  if (action === 'installment.cancel' || action === 'installment.payoff') {
    keys(d, action.endsWith('payoff') ? ['id', 'reason', 'amount'] : ['id', 'reason']);
    const id = find(s.installmentPurchases, d.id).id; const reason = text(d.reason)!;
    return action.endsWith('payoff') ? payoffInstallment(s, id, m, money(d.amount), reason) : cancelInstallmentFromMonth(s, id, m, reason);
  }
  return undefined;
}
