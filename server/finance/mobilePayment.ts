import { randomUUID } from 'node:crypto';
import { computeMonthlyAccounts, type FinanceDataStore } from '../../src/domain/financeRules.js';
import { assertMonthOpen } from '../../src/domain/monthOperations.js';
import { openAmount, roundPayment } from '../../src/domain/paymentBalances.js';
import type { AccountType } from '../../src/types/finance.js';
import { addMonths } from '../../src/utils/formatters.js';
import { FoundationError } from '../foundation.js';
import { invalid, keys, money, month as monthKey, uuid } from './validation.js';

export function mobilePaymentInput(data: Record<string, unknown>) {
  keys(data, ['requestId', 'id', 'type', 'amount', 'expectedOpen', 'transfer']);
  const type = data.type as AccountType;
  if (!['simple', 'recurring', 'installment', 'credit_card'].includes(type) || typeof data.transfer !== 'boolean') throw invalid();
  return { requestId: uuid(data.requestId), id: uuid(data.id), type, amount: money(data.amount),
    expectedOpen: money(data.expectedOpen), transfer: data.transfer };
}

export function recordMobilePayment(store: FinanceDataStore, month: string, input: ReturnType<typeof mobilePaymentInput>, actorId: string) {
  const { requestId, id, type, amount, expectedOpen, transfer } = input;
  const account = computeMonthlyAccounts(month, store).find(row => row.id === id && row.type === type);
  if (!account || openAmount(account) !== expectedOpen) throw new FoundationError(409, 'O saldo em aberto mudou.');
  const remainingAmount = roundPayment(expectedOpen - amount);
  if (amount <= 0 || remainingAmount < 0 || (transfer && remainingAmount === 0)) throw invalid();

  if (type === 'credit_card' && !account.paymentInfo && (
    store.cardMonthlyInvoices.some(row => row.cardId === id && row.month > month && ((row.paidAmount ?? 0) > 0 || row.status === 'pago')) ||
    store.mobilePayments?.some(row => row.accountId === id && row.accountType === type && row.month > month)
  )) {
    throw new FoundationError(422, 'Use a fatura mais recente que já possui pagamentos.');
  }

  const createdAt = new Date().toISOString();
  let target;
  if (transfer) {
    const targetMonth = monthKey(addMonths(month, 1));
    assertMonthOpen(store, targetMonth);
    const next = computeMonthlyAccounts(targetMonth, store);
    const sameName = next.filter(row => row.type === 'simple' && row.categoryId === account.categoryId &&
      row.name.trim().toLocaleLowerCase('pt-BR') === account.name.trim().toLocaleLowerCase('pt-BR'));
    const match = next.find(row => row.type === type && row.id === id) ?? (type === 'simple' && sameName.length === 1 ? sameName[0] : undefined);
    if (match) {
      if (type !== 'credit_card') money(roundPayment(match.amount + remainingAmount));
      target = { targetMonth, targetId: match.id, targetType: match.type };
    } else {
      const targetId = randomUUID();
      store.simpleAccounts.push({ id: targetId, name: account.name, categoryId: account.categoryId, notes: account.notes,
        month: targetMonth, value: 0, status: 'pendente', createdAt });
      target = { targetMonth, targetId, targetType: 'simple' as const };
    }
  }

  const location = account.notes?.match(/^Local: (.+)$/m)?.[1];
  (store.mobilePayments ??= []).push({ id: requestId, actorId, accountId: id, accountType: type, month, name: account.name,
    categoryName: account.category?.name, location, paidAmount: amount, remainingAmount, createdAt, ...target });
}

export function assertRecordedBalances(store: FinanceDataStore) {
  const accounts = new Map<string, ReturnType<typeof computeMonthlyAccounts>>();
  function assertBalance(month: string, id: string, type: AccountType) {
    if (!accounts.has(month)) accounts.set(month, computeMonthlyAccounts(month, store));
    const account = accounts.get(month)!.find(row => row.id === id && row.type === type);
    if (!account || (account.paymentInfo?.paidAmount ?? 0) > account.amount) {
      throw new FoundationError(422, 'A alteração afetaria um pagamento ou saldo transferido já registrado.');
    }
  }
  for (const payment of store.mobilePayments ?? []) {
    assertBalance(payment.month, payment.accountId, payment.accountType);
    if (payment.targetMonth && payment.targetId && payment.targetType) {
      assertBalance(payment.targetMonth, payment.targetId, payment.targetType);
    }
  }
}
