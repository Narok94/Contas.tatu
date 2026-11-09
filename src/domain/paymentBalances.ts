import type { AccountType, MobilePayment, UnifiedMonthlyAccount } from '../types/finance.js';

export const roundPayment = (value: number) => Math.round(value * 100) / 100;

export function paymentBalances(payments: MobilePayment[] = [], month: string, id: string, type: AccountType) {
  let paid = 0, outgoing = 0, incoming = 0;
  for (const payment of payments) {
    if (payment.month === month && payment.accountId === id && payment.accountType === type) {
      paid += Math.round(payment.paidAmount * 100);
      if (payment.targetMonth) outgoing += Math.round(payment.remainingAmount * 100);
    }
    if (payment.targetMonth === month && payment.targetId === id && payment.targetType === type) {
      incoming += Math.round(payment.remainingAmount * 100);
    }
  }
  return { paid: paid / 100, outgoing: outgoing / 100, incoming: incoming / 100 };
}

export function openAmount(account: UnifiedMonthlyAccount) {
  return account.paymentInfo?.openAmount ?? account.cardInfo?.totalOpenAmount ??
    (account.status === 'pago' ? 0 : account.amount);
}
