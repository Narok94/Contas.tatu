import type { FinanceDataStore } from '../domain/financeRules';
import type { UnifiedMonthlyAccount } from '../types/finance';
import { formatMonthEnd } from '../utils/formatters';

export const ADMIN_MESSAGE = 'Essa alteração precisa ser feita pelo Contas Tatu no computador.';
export const ACCESS_MESSAGE = 'Você pode explorar a interface. Para consultar e salvar seus dados, o acesso autenticado ainda precisa ser liberado.';
export interface MobileEntry {
  key: string; id: string; kind: 'simple' | 'expense' | 'installment' | 'recurring' | 'credit_card';
  name: string; amount: number; month: string; categoryId?: string; createdAt: string;
  reference: string; badge?: string; paid?: boolean; account?: UnifiedMonthlyAccount;
}
export function recentEntries(s: FinanceDataStore): MobileEntry[] {
  const simple: MobileEntry[] = s.simpleAccounts.map(a => ({ key: `simple:${a.id}`, id: a.id, kind: 'simple',
    name: a.name, amount: a.value, month: a.month, categoryId: a.categoryId, createdAt: a.createdAt,
    reference: formatMonthEnd(a.month), paid: a.status === 'pago', badge: a.status === 'pago' ? 'Paga' : undefined }));
  const expenses: MobileEntry[] = s.cardExpenses.map(a => ({ key: `expense:${a.id}`, id: a.id, kind: 'expense',
    name: a.description, amount: a.amount, month: a.month, categoryId: a.categoryId, createdAt: a.createdAt,
    reference: `${formatMonthEnd(a.month)} · ${s.creditCards.find(c => c.id === a.cardId)?.name ?? 'Cartão'}`, badge: 'À vista no cartão' }));
  const installments: MobileEntry[] = s.installmentPurchases.map(p => {
    const latest = p.versions?.slice().sort((a, b) => b.revision - a.revision)[0];
    return { key: `installment:${p.id}`, id: p.id, kind: 'installment', name: p.description,
      amount: p.totalAmount, month: p.startMonth, categoryId: p.categoryId, createdAt: p.createdAt,
      reference: `Desde ${formatMonthEnd(p.startMonth)}`, badge: latest?.operation === 'cancel' ? 'Cancelado' : latest?.operation === 'payoff' ? 'Quitado' : `${p.installmentsCount}x${p.creditCardId ? ' no cartão' : ''}` };
  });
  return [...simple, ...expenses, ...installments].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.key.localeCompare(b.key));
}
export function monthlyEntries(accounts: UnifiedMonthlyAccount[], month: string): MobileEntry[] {
  return accounts.map(a => ({ key: `${a.type}:${a.id}`, id: a.id, kind: a.type, name: a.name, amount: a.amount,
    month, categoryId: a.categoryId, createdAt: '', account: a, paid: a.status === 'pago',
    reference: `${formatMonthEnd(month)}${a.installmentInfo ? ` · ${a.installmentInfo.currentInstallment}/${a.installmentInfo.totalInstallments}` : a.type === 'credit_card' ? ' · Fatura' : a.type === 'recurring' ? ' · Conta fixa' : ''}`,
    badge: a.status === 'pago' ? 'Paga' : a.status === 'parcial' ? 'Parcial' : undefined }));
}
export function parseMobileMoney(value: string) {
  const normalized = value.trim().replace(',', '.');
  if (!/^\d{1,13}(\.\d{1,2})?$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 && amount <= 9999999999999.99 ? amount : null;
}
export const canQuickEdit = (entry: MobileEntry, store: FinanceDataStore) =>
  !store.closedMonths?.[entry.month] && ['simple', 'expense'].includes(entry.kind);
