import { randomUUID } from 'node:crypto';
import { FoundationError } from '../foundation.js';
import { computeFinancialSummary, computeMonthlyAccounts } from '../../src/domain/financeRules.js';
import { computeActiveInstallments, computeAnnualHistory } from '../../src/domain/history.js';
import { assertFinancialMutation, assertMonthOpen, closeMonth, reopenMonth, recordPayment } from '../../src/domain/monthOperations.js';
import { installmentPayoffQuote } from '../../src/domain/installmentOperations.js';
import type { AccountType, PaymentStatus } from '../../src/types/finance.js';
import { accountCommand } from './accounts.js';
import { cardCommand } from './cards.js';
import { installmentCommand } from './installments.js';
import { createRepository } from './repository.js';
import { assertRecordedBalances, mobilePaymentInput, recordMobilePayment } from './mobilePayment.js';
import { openAmount, roundPayment } from '../../src/domain/paymentBalances.js';
import { invalid, keys, money, month, object, text, uuid } from './validation.js';

export function createFinanceService(repository = createRepository()) {
  return {
    async read(value: unknown) {
      const m = month(value); const loaded = await repository.load(); const { store } = loaded;
      const accounts = computeMonthlyAccounts(m, store);
      return { revision: loaded.revision, month: m, state: store, accounts,
        summary: computeFinancialSummary(m, store), annual: computeAnnualHistory(Number(m.slice(0, 4)), store),
        activeInstallments: computeActiveInstallments(m, store),
        // Informational subsets only; never added again to summary.totalPaid/totalPending.
        partial: { paid: accounts.filter(a => a.status === 'parcial').reduce((n,a) => n + Math.round((a.paymentInfo?.paidAmount ?? a.cardInfo?.paidAmount ?? 0) * 100), 0) / 100,
          remaining: accounts.filter(a => a.status === 'parcial').reduce((n,a) => n + Math.round(openAmount(a) * 100), 0) / 100 },
      };
    },
    async payoffQuote(id: unknown, value: unknown) {
      const m = month(value); const loaded = await repository.load();
      try { return { revision: loaded.revision, amount: installmentPayoffQuote(loaded.store, uuid(id), m) }; }
      catch { throw new FoundationError(422, 'Payoff unavailable for this month'); }
    },
    async execute(value: unknown, actorId?: string) {
      const cmd = object(value); keys(cmd, ['action', 'month', 'expectedRevision', 'data']);
      const m = month(cmd.month); const action = text(cmd.action)!; const data = object(cmd.data ?? {});
      if (typeof cmd.expectedRevision !== 'string' || !/^(0|[1-9]\d*)$/.test(cmd.expectedRevision)) throw invalid();
      const before = await repository.load();
      const mobile = action === 'payment.mobile' ? mobilePaymentInput(data) : undefined;
      if (mobile) {
        if (!actorId) throw invalid();
        const existing = before.store.mobilePayments?.find(row => row.id === mobile.requestId);
        if (existing) {
          if (existing.actorId === actorId && existing.month === m && existing.accountId === mobile.id &&
              existing.accountType === mobile.type && existing.paidAmount === mobile.amount &&
              roundPayment(existing.paidAmount + existing.remainingAmount) === mobile.expectedOpen &&
              Boolean(existing.targetMonth) === mobile.transfer) {
            return { status: 'ok', revision: before.revision, state: before.store };
          }
          throw new FoundationError(409, 'Identificador do pagamento já utilizado.');
        }
      }
      if (cmd.expectedRevision !== before.revision) throw new FoundationError(409, 'State changed; reload before retrying');
      let next = structuredClone(before.store);
      try {
        if (action === 'month.reopen') { keys(data, []); next = reopenMonth(next, m); }
        else {
          assertMonthOpen(next, m);
          if (mobile) recordMobilePayment(next, m, mobile, actorId!);
          else if (action === 'month.close') { keys(data, []); next = closeMonth(next, m); }
          else if (action === 'payment') {
            keys(data, ['id', 'type', 'status', 'amount']); uuid(data.id);
            if (!['simple', 'recurring', 'installment', 'credit_card'].includes(String(data.type)) || !['pendente', 'parcial', 'pago'].includes(String(data.status))) throw invalid();
            const account = next.mobilePayments?.length
              ? computeMonthlyAccounts(m, next).find(row => row.id === data.id && row.type === data.type)
              : undefined;
            if (account?.paymentInfo && data.status === 'pago' && data.amount === undefined && actorId) {
              const amount = openAmount(account);
              if (amount > 0) recordMobilePayment(next, m, { requestId: randomUUID(), id: account.id, type: account.type, amount, expectedOpen: amount, transfer: false }, actorId);
            } else {
              next = recordPayment(next, m, data.id as string, data.type as AccountType, data.status as PaymentStatus, data.amount === undefined ? undefined : money(data.amount));
            }
          } else if (!accountCommand(next, action, m, data) && !cardCommand(next, action, m, data)) {
            const changed = installmentCommand(next, action, m, data);
            if (!changed) throw invalid(); next = changed;
          }
          assertFinancialMutation(before.store, next);
          assertRecordedBalances(next);
        }
      } catch (error) {
        if (error instanceof FoundationError) throw error;
        throw new FoundationError(422, 'Financial operation violates the current month or lifecycle rules');
      }
      // Existing pure commands generate local IDs for virtual monthly rows; SQL requires UUIDs.
      for (const row of [...next.recurringMonthlyRecords, ...next.cardMonthlyInvoices]) {
        if (!/^[0-9a-f]{8}-/i.test(row.id)) row.id = randomUUID();
      }
      const revision = await repository.save(before, next, actorId);
      return { status: 'ok', revision, state: next };
    },
  };
}
