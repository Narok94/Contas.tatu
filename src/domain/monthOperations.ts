import { FinanceDataStore, computeMonthlyAccounts, computeFinancialSummary } from './financeRules';
import { AccountType, PaymentStatus } from '../types/finance';
import { getInstallmentStatusForMonth } from './installmentTimeline';

// Commands can target a month different from the one currently displayed.
export function assertFinancialMutation(previous: FinanceDataStore, next: FinanceDataStore) {
  for (const p of previous.installmentPurchases) {
    const updated = next.installmentPurchases.find(item => item.id === p.id);
    if (p.versions?.length && !updated) {
      throw new Error('Parcelamento com versões históricas não pode ser removido; use cancelamento futuro.');
    }
    if (p.versions?.length && updated) {
      if (JSON.stringify(p.versions) !== JSON.stringify(updated.versions?.slice(0, p.versions.length)) ||
          JSON.stringify(p.monthlySnapshots) !== JSON.stringify(updated.monthlySnapshots)) {
        throw new Error('Versões e snapshots anteriores do parcelamento são imutáveis.');
      }
    }
    if (updated?.versions?.length) {
      const paymentMonths = new Set([...Object.keys(p.statusByMonth ?? {}),
        ...Object.keys(p.paymentAmountsByMonth ?? {}), ...previous.cardMonthlyInvoices.map(i => i.month)]);
      for (const m of paymentMonths) {
        const before = getInstallmentStatusForMonth(p, m), after = getInstallmentStatusForMonth(updated, m);
        if (before.isActive && (!after.isActive || before.creditCardId !== after.creditCardId)) {
          const ownPayment = (p.statusByMonth?.[m] && p.statusByMonth[m] !== 'pendente') || p.paymentAmountsByMonth?.[m] !== undefined;
          const cardPayment = previous.cardMonthlyInvoices.some(i => i.month === m &&
            (i.cardId === before.creditCardId || i.cardId === after.creditCardId) && ((i.paidAmount ?? 0) > 0 || i.status === 'pago'));
          if (ownPayment || cardPayment) throw new Error('Há pagamentos no período afetado; concilie antes de transferir ou encerrar.');
        }
      }
      for (const m of Object.keys(previous.closedMonths ?? {})) {
        if (JSON.stringify(getInstallmentStatusForMonth(p, m)) !== JSON.stringify(getInstallmentStatusForMonth(updated, m))) {
          assertMonthOpen(previous, m);
        }
      }
      if (updated.versions.some(v => v.creditCardId && !next.creditCards.some(c => c.id === v.creditCardId))) {
        throw new Error('Cartão referenciado por versão histórica não pode ser removido.');
      }
    }
  }
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
  if (type === 'installment') {
    const purchase = store.installmentPurchases.find(p => p.id === id)!;
    if (getInstallmentStatusForMonth(purchase, month).operation === 'payoff') {
      throw new Error('Quitação antecipada é um evento auditável; pagamento comum não pode alterá-la.');
    }
  }
  if (account.status === status && (type !== 'credit_card' || amount === undefined)) return store;
  const value = amount ?? account.amount;
  if (!Number.isFinite(value) || value < 0 || !Number.isSafeInteger(Math.round(value * 100)) || Math.abs(value * 100 - Math.round(value * 100)) > 0.00001) {
    throw new Error('Informe um valor válido, não negativo, com até duas casas decimais.');
  }
  if (type === 'credit_card') {
    if (value > account.amount) throw new Error('O pagamento não pode superar o total da fatura.');
    if (status === 'parcial' && value <= 0) throw new Error('Informe um pagamento maior que zero.');
    const paidAmount = status === 'pendente' ? 0 : value;
    const payoffFloor = store.installmentPurchases.reduce((sum, p) => {
      const st = getInstallmentStatusForMonth(p, month);
      return sum + (st.isActive && st.operation === 'payoff' && st.creditCardId === id ? Math.round(st.installmentAmount * 100) : 0);
    }, 0) / 100;
    if (paidAmount < payoffFloor) throw new Error('O pagamento não pode desfazer uma quitação antecipada registrada.');
    const invoiceStatus: PaymentStatus = status === 'pendente' ? 'pendente'
      : paidAmount >= account.amount ? 'pago' : paidAmount > 0 ? 'parcial' : 'pendente';
    const existing = store.cardMonthlyInvoices.find(i => i.cardId === id && i.month === month);
    if (existing?.paidAmount === paidAmount && existing.status === invoiceStatus) return store;
    const invoice = { ...existing, id: existing?.id ?? `inv_${id}_${month}`, cardId: id, month,
      status: invoiceStatus, paidAmount, paidAt: paidAmount > 0 ? new Date().toISOString() : undefined };
    return { ...store, cardMonthlyInvoices: [...store.cardMonthlyInvoices.filter(i => i !== existing), invoice] };
  }
  if (status === 'parcial') throw new Error('Pagamento parcial disponível apenas para cartões.');
  const paidValue = status === 'pago' ? value : account.amount;
  if (type === 'simple') return { ...store, simpleAccounts: store.simpleAccounts.map(a => a.id === id ? { ...a, value: paidValue, status } : a) };
  if (type === 'recurring') {
    const existing = store.recurringMonthlyRecords.find(r => r.definitionId === id && r.month === month);
    const record = { ...existing, id: existing?.id ?? `rec_rec_${id}_${month}`, definitionId: id, month, value: paidValue, isValueSet: true, status };
    return { ...store, recurringMonthlyRecords: [...store.recurringMonthlyRecords.filter(r => r !== existing), record] };
  }
  if (type === 'installment') return { ...store, installmentPurchases: store.installmentPurchases.map(p => p.id === id ? { ...p, statusByMonth: { ...p.statusByMonth, [month]: status }, paymentAmountsByMonth: { ...p.paymentAmountsByMonth, [month]: paidValue } } : p) };
  return store;
}
