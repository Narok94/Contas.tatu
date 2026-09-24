import { FinanceDataStore, computeMonthlyAccounts } from './financeRules';
import { assertFinancialMutation, assertMonthOpen, recordPayment } from './monthOperations';
import { InstallmentPurchase, InstallmentVersion } from '../types/finance';
import { appendInstallmentVersion, getInstallmentStatusForMonth, InstallmentChange,
  installmentVersions, assertInstallmentMoney } from './installmentTimeline';

function purchaseIn(store: FinanceDataStore, id: string) {
  const p = store.installmentPurchases.find(p => p.id === id);
  if (!p) throw new Error('Parcelamento não encontrado.');
  return p;
}

function persistChange(store: FinanceDataStore, p: InstallmentPurchase, month: string,
  operation: Exclude<InstallmentVersion['operation'], 'initial'>, data: InstallmentChange,
  reason: string, payoffAmount?: number): FinanceDataStore {
  assertMonthOpen(store, month);
  const updated = appendInstallmentVersion(p, month, operation, data, reason, payoffAmount);
  const affects = (m: string) => operation === 'correction' ? m === month : m >= month;
  const before = getInstallmentStatusForMonth(p, month);
  const after = getInstallmentStatusForMonth(updated, month);
  if (after.creditCardId && !store.creditCards.some(c => c.id === after.creditCardId)) throw new Error('Cartão não encontrado.');
  if (after.categoryId && !store.categories.some(c => c.id === after.categoryId)) throw new Error('Categoria não encontrada.');
  // Never hide previously registered payments or silently move them between payment owners.
  const changedOwner = before.creditCardId !== after.creditCardId;
  if (changedOwner || operation === 'cancel' || operation === 'payoff') {
    const paidState = Object.entries(p.statusByMonth ?? {}).some(([m, status]) => affects(m) && status !== 'pendente');
    const override = Object.keys(p.paymentAmountsByMonth ?? {}).some(affects);
    const cardPaid = store.cardMonthlyInvoices.some(i => affects(i.month) &&
      [before.creditCardId, after.creditCardId].includes(i.cardId) && ((i.paidAmount ?? 0) > 0 || i.status === 'pago'));
    if (paidState || override || cardPaid) throw new Error('Há pagamentos ou correções no período afetado; concilie-os explicitamente antes de alterar o vínculo ou encerrar.');
  }
  const next = { ...store, installmentPurchases: store.installmentPurchases.map(item => item.id === p.id ? updated : item) };
  assertFinancialMutation(store, next);
  return next;
}

/** Forward changes cannot precede an already recorded boundary; no old occurrence is rewritten. */
export function changeInstallmentFromMonth(store: FinanceDataStore, id: string, month: string,
  data: InstallmentChange, reason: string): FinanceDataStore {
  return persistChange(store, purchaseIn(store, id), month, 'change', data, reason);
}

/** One-month audited correction; adjacent months and original versions remain unchanged. */
export function correctInstallmentMonth(store: FinanceDataStore, id: string, month: string,
  data: InstallmentChange, reason: string): FinanceDataStore {
  return persistChange(store, purchaseIn(store, id), month, 'correction', data, reason);
}

function currentConfiguration(p: InstallmentPurchase, month: string): InstallmentChange {
  const st = getInstallmentStatusForMonth(p, month);
  return { description: st.description, totalAmount: st.totalAmount, installmentsCount: st.totalInstallments,
    currentInstallment: st.currentInstallment, categoryId: st.categoryId, creditCardId: st.creditCardId ?? '' };
}

export function cancelInstallmentFromMonth(store: FinanceDataStore, id: string, month: string, reason: string): FinanceDataStore {
  const p = purchaseIn(store, id);
  return persistChange(store, p, month, 'cancel', currentConfiguration(p, month), reason);
}

/** Remaining scheduled occurrences, including this month; no interest, discount or invented cent. */
export function installmentPayoffQuote(store: FinanceDataStore, id: string, month: string): number {
  const p = purchaseIn(store, id);
  const st = getInstallmentStatusForMonth(p, month);
  if (!st.isActive || st.operation === 'payoff') throw new Error('Parcelamento não está disponível para quitação.');
  if (installmentVersions(p).some(v => v.operation !== 'initial' && v.effectiveFromMonth >= month && v.operation === 'correction')) {
    throw new Error('Há correções mensais no período; concilie o plano antes de quitar.');
  }
  if (installmentVersions(p).some(v => v.effectiveFromMonth > month)) throw new Error('Há alterações posteriores; concilie o plano antes de quitar.');
  // Sparse legacy snapshots may carry different values; do not silently approximate them.
  if (Object.keys(p.monthlySnapshots ?? {}).some(m => m >= month)) throw new Error('Há snapshots no período; concilie o plano antes de quitar.');
  const amount = Math.round(st.installmentAmount * 100) * (st.remainingInstallments + 1) / 100;
  assertInstallmentMoney(amount);
  return amount;
}

/** Atomic in-memory command. For cards, the actual payment belongs to the invoice, counted once. */
export function payoffInstallment(store: FinanceDataStore, id: string, month: string,
  amount: number, reason: string): FinanceDataStore {
  assertInstallmentMoney(amount);
  if (amount !== installmentPayoffQuote(store, id, month)) throw new Error('Quitação deve corresponder às parcelas restantes, sem juros ou descontos.');
  const p = purchaseIn(store, id);
  const config = currentConfiguration(p, month);
  const next = persistChange(store, p, month, 'payoff', config, reason, amount);
  if (!config.creditCardId) return next; // Event itself is the single paid standalone occurrence.
  const card = computeMonthlyAccounts(month, next).find(a => a.cardInfo?.cardId === config.creditCardId);
  if (!card) throw new Error('Fatura de quitação não encontrada.');
  return recordPayment(next, month, card.id, 'credit_card', 'pago', amount);
}
