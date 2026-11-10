import test from 'node:test';
import assert from 'node:assert/strict';
import { computeDesktopInsights } from '../src/domain/desktopInsights';
import { computeMonthlyAccounts, computeFinancialSummary, type FinanceDataStore } from '../src/domain/financeRules';
import { appendInstallmentVersion } from '../src/domain/installmentTimeline';
const empty = (): FinanceDataStore => ({ categories: [], creditCards: [{ id: 'card', name: 'Card', createdAt: '' }], simpleAccounts: [], recurringDefinitions: [], recurringMonthlyRecords: [], installmentPurchases: [], cardExpenses: [], cardMonthlyInvoices: [] });
const purchase = (id: string, startMonth: string, installmentsCount: number, totalAmount: number, creditCardId?: string) => ({ id, description: id, startMonth, installmentsCount, totalAmount, creditCardId, createdAt: '' });
test('empty month has zero insights', () => {
  assert.deepEqual(computeDesktopInsights('2026-11', empty()), { endingCount: 0, releasedAmount: 0, continuingCount: 0, reduction: 0 });
});
test('counts card and standalone purchases once, includes new commitments next month', () => {
  const store = empty();
  store.installmentPurchases = [purchase('ending', '2026-10', 2, 100, 'card'), purchase('continuing', '2026-11', 3, 300), purchase('new', '2026-12', 2, 60, 'card')];
  assert.deepEqual(computeDesktopInsights('2026-11', store), { endingCount: 1, releasedAmount: 50, continuingCount: 1, reduction: 20 });
});
test('December rolls into January and reports an increase without pretending savings', () => {
  const store = empty(); store.installmentPurchases = [purchase('new', '2027-01', 3, 100)];
  assert.equal(computeDesktopInsights('2026-12', store).reduction, -33.33);
});
test('respects cancellation and immutable closed-month account snapshots', () => {
  const store = empty(); const p = purchase('scheduled', '2026-10', 4, 400);
  store.installmentPurchases = [p];
  store.closedMonths = { '2026-11': { month: '2026-11', closedAt: '', accounts: computeMonthlyAccounts('2026-11', store), summary: computeFinancialSummary('2026-11', store) } };
  store.installmentPurchases = [appendInstallmentVersion(p, '2026-12', 'cancel', { description: p.description, totalAmount: 400, installmentsCount: 4 }, 'test')];
  assert.deepEqual(computeDesktopInsights('2026-11', store), { endingCount: 1, releasedAmount: 100, continuingCount: 0, reduction: 100 });
});
