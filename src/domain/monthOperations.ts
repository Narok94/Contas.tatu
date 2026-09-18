import { FinanceDataStore, computeMonthlyAccounts, computeFinancialSummary } from './financeRules';
import { AccountType, PaymentStatus } from '../types/finance';

// Commands can target a month different from the one currently displayed.
export function assertFinancialMutation(previous: FinanceDataStore, next: FinanceDataStore) {
  if (JSON.stringify(previous.closedMonthHistory ?? {}) !== JSON.stringify(next.closedMonthHistory ?? {})) {
    throw new Error('Os fechamentos anteriores não podem ser alterados.');
  }
  for (const month of Object.keys(previous.closedMonths ?? {})) {
    if (JSON.stringify(previous.closedMonths![month]) !== JSON.stringify(next.closedMonths?.[month])) {
      throw new Error('O retrato de um mês fechado não pode ser alterado.');
    }
    for (const field of ['simpleAccounts', 'recurringMonthlyRecords', 'cardExpenses', 'cardMonthlyInvoices'] as const) {
      const before = previous[field].filter(item => item.month === month);
      const after = next[field].filter(item => item.month === month);
      // Category metadata may change globally; snapshots retain the original category.
      const financial = (items: typeof before) => JSON.stringify(items.map(item => ({ ...item, categoryId: undefined })));
      if (financial(before) !== financial(after)) assertMonthOpen(previous, month);
    }
  }
}

export function assertMonthOpen(store: FinanceDataStore, month: string) {
  if (store.closedMonths?.[month]) throw new Error('Este mês está fechado. Pagamentos, reversões e edições estão bloqueados para preservar o histórico.');
}

export function canCloseMonth(store: FinanceDataStore, month: string): boolean {
  if (store.closedMonths?.[month]) return false;
  return computeMonthlyAccounts(month, store).every(account =>
    account.status === 'pago' && (!account.recurringInfo || account.recurringInfo.isValueSet));
}

/** Explicit lifecycle command: archive the official snapshot, never mutate financial records. */
export function reopenMonth(store: FinanceDataStore, month: string): FinanceDataStore {
  const snapshot = store.closedMonths?.[month];
  if (!snapshot) throw new Error('Este mês já está em andamento.');
  const closedMonths = { ...store.closedMonths };
  delete closedMonths[month];
  return {
    ...store,
    closedMonths,
    closedMonthHistory: {
      ...store.closedMonthHistory,
      [month]: [...(store.closedMonthHistory?.[month] ?? []), structuredClone(snapshot)],
    },
  };
}

export function closeMonth(store: FinanceDataStore, month: string): FinanceDataStore {
  assertMonthOpen(store, month);
  const accounts = computeMonthlyAccounts(month, store);
  const summary = computeFinancialSummary(month, store);
  const pending = accounts.filter(a => a.status !== 'pago' || (a.recurringInfo && !a.recurringInfo.isValueSet)).length;
  if (pending) {
    throw new Error(`Há ${pending} conta(s) pendente(s) neste mês. Resolva as contas deste mês antes de fechar.`);
  }
  return { ...store, closedMonths: { ...store.closedMonths, [month]: structuredClone({ month, closedAt: new Date().toISOString(), accounts, summary }) } };
}

// Comando explícito e idempotente: cliques repetidos nunca revertem um pagamento.
export function recordPayment(store: FinanceDataStore, month: string, id: string, type: AccountType, status: PaymentStatus, amount?: number): FinanceDataStore {
  assertMonthOpen(store, month);
  const account = computeMonthlyAccounts(month, store).find(a => a.id === id && a.type === type);
  if (!account) throw new Error('Esta conta não está mais disponível neste mês.');
  if (account.status === status) return store;
  const value = amount ?? account.amount;
  if (!Number.isFinite(value) || value < 0 || !Number.isSafeInteger(Math.round(value * 100)) || Math.abs(value * 100 - Math.round(value * 100)) > 0.00001) {
    throw new Error('Informe um valor válido, não negativo, com até duas casas decimais.');
  }
  if (type === 'credit_card' && value !== account.amount) throw new Error('O total da fatura é calculado pelas compras. Corrija os itens antes de pagar.');
  const paidValue = status === 'pago' ? value : account.amount;
  if (type === 'simple') return { ...store, simpleAccounts: store.simpleAccounts.map(a => a.id === id ? { ...a, value: paidValue, status } : a) };
  if (type === 'recurring') {
    const existing = store.recurringMonthlyRecords.find(r => r.definitionId === id && r.month === month);
    const record = { ...existing, id: existing?.id ?? `rec_rec_${id}_${month}`, definitionId: id, month, value: paidValue, isValueSet: true, status };
    return { ...store, recurringMonthlyRecords: [...store.recurringMonthlyRecords.filter(r => r !== existing), record] };
  }
  if (type === 'installment') return { ...store, installmentPurchases: store.installmentPurchases.map(p => p.id === id ? { ...p, statusByMonth: { ...p.statusByMonth, [month]: status }, paymentAmountsByMonth: { ...p.paymentAmountsByMonth, [month]: paidValue } } : p) };
  const existing = store.cardMonthlyInvoices.find(i => i.cardId === id && i.month === month);
  const invoice = { ...existing, id: existing?.id ?? `inv_${id}_${month}`, cardId: id, month, status, paidAt: status === 'pago' ? new Date().toISOString() : undefined };
  return { ...store, cardMonthlyInvoices: [...store.cardMonthlyInvoices.filter(i => i !== existing), invoice] };
}
