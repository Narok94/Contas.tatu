import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closeMonth, recordPayment, assertMonthOpen, assertFinancialMutation } from '../src/domain/monthOperations';
import { computeMonthlyAccounts, computeOperationalMonthlyAccounts, computeFinancialSummary, getPreviousPendingCardInvoices, applyInstallmentUpdate, FinanceDataStore } from '../src/domain/financeRules';
import { loadFinanceStore, saveFinanceStore } from '../src/services/financeStorage';

const month = '2026-09';
function fixture(): FinanceDataStore {
  return { categories: [{ id: 'home', name: 'Casa', color: '#123456' }], simpleAccounts: [{ id: 'simple', name: 'Havan', value: 180, month, status: 'pendente', categoryId: 'home', createdAt: '' }], recurringDefinitions: [], recurringMonthlyRecords: [], installmentPurchases: [], creditCards: [], cardExpenses: [], cardMonthlyInvoices: [] };
}
test('mês em andamento pode ser consultado sem fechamento', () => {
  const store = fixture();
  assert.equal(computeMonthlyAccounts(month, store)[0].name, 'Havan');
  assert.equal(computeFinancialSummary(month, store).totalPending, 180);
  assert.equal(store.closedMonths, undefined);
});
test('pendência bloqueia fechamento sem alterar dados', () => {
  const store = fixture(), before = structuredClone(store);
  assert.throws(() => closeMonth(store, month), /1 conta/);
  assert.deepEqual(store, before);
});
test('pagamento sem correção e reversão preservam valor', () => {
  const paid = recordPayment(fixture(), month, 'simple', 'simple', 'pago');
  assert.equal(computeFinancialSummary(month, paid).totalPaid, 180);
  assert.equal(recordPayment(paid, month, 'simple', 'simple', 'pago'), paid);
  const undone = recordPayment(paid, month, 'simple', 'simple', 'pendente');
  assert.equal(undone.simpleAccounts[0].value, 180);
  assert.equal(computeFinancialSummary(month, undone).totalPending, 180);
});
test('correção e pagamento são atômicos, idempotentes e sem ajuste separado', () => {
  const initial = fixture();
  const paid = recordPayment(initial, month, 'simple', 'simple', 'pago', 193.47);
  assert.equal(initial.simpleAccounts[0].value, 180);
  assert.equal(paid.simpleAccounts.length, 1);
  assert.equal(paid.simpleAccounts[0].value, 193.47);
  assert.equal(paid.simpleAccounts[0].status, 'pago');
  assert.equal(computeFinancialSummary(month, paid).totalPaid, 193.47);
  assert.equal(recordPayment(paid, month, 'simple', 'simple', 'pago', 999), paid);
  assert.equal(recordPayment(paid, month, 'simple', 'simple', 'pendente').simpleAccounts[0].value, 193.47);
});
test('valores inválidos não alteram o estado', () => {
  const store = fixture(), before = structuredClone(store);
  for (const amount of [-1, NaN, Infinity, 1.001]) assert.throws(() => recordPayment(store, month, 'simple', 'simple', 'pago', amount), /valor válido/);
  assert.deepEqual(store, before);
});
test('fechamento cria retrato independente e impede duplicação e reversão', () => {
  const paid = recordPayment(fixture(), month, 'simple', 'simple', 'pago');
  const closed = closeMonth(paid, month);
  assert.ok(closed.closedMonths?.[month].closedAt);
  assert.equal(closed.closedMonths?.[month].summary.totalPaid, 180);
  assert.throws(() => closeMonth(closed, month), /fechado/);
  assert.throws(() => recordPayment(closed, month, 'simple', 'simple', 'pendente'), /fechado/);
  assert.throws(() => assertMonthOpen(closed, month), /fechado/);
  closed.categories[0].name = 'Novo nome';
  closed.simpleAccounts[0].value = 999;
  assert.equal(computeFinancialSummary(month, closed).totalPaid, 180);
  assert.equal(computeMonthlyAccounts(month, closed)[0].category?.name, 'Casa');
  const copy = computeMonthlyAccounts(month, closed); copy[0].amount = 1;
  assert.equal(computeMonthlyAccounts(month, closed)[0].amount, 180);
});
test('proteção de mutações cobre edição, exclusão, inserção e perda de snapshot', () => {
  const closed = closeMonth(recordPayment(fixture(), month, 'simple', 'simple', 'pago'), month);
  for (const mutation of [
    (s: FinanceDataStore) => { s.simpleAccounts[0].value = 999; },
    (s: FinanceDataStore) => { s.simpleAccounts = []; },
    (s: FinanceDataStore) => { s.simpleAccounts.push({ ...s.simpleAccounts[0], id: 'new' }); },
    (s: FinanceDataStore) => { s.closedMonths = {}; },
  ]) { const next = structuredClone(closed); mutation(next); assert.throws(() => assertFinancialMutation(closed, next)); }
  const future = structuredClone(closed); future.simpleAccounts.push({ ...future.simpleAccounts[0], id: 'future', month: '2026-10', status: 'pendente' });
  assert.doesNotThrow(() => assertFinancialMutation(closed, future));
});
test('fixa corrige somente registro mensal, incluindo valor inicialmente não informado', () => {
  const store = fixture(); store.simpleAccounts = [];
  store.recurringDefinitions.push({ id: 'fixed', name: 'Luz', startMonth: '2026-08', isActive: true, createdAt: '' });
  assert.throws(() => closeMonth(store, month), /pendente/);
  const paid = recordPayment(store, month, 'fixed', 'recurring', 'pago', 112);
  assert.equal(computeMonthlyAccounts(month, paid)[0].amount, 112);
  assert.equal(computeMonthlyAccounts('2026-08', paid)[0].amount, 0);
  assert.equal(computeMonthlyAccounts('2026-10', paid)[0].amount, 0);
  assert.deepEqual(paid.recurringDefinitions, store.recurringDefinitions);
  assert.ok(closeMonth(paid, month).closedMonths?.[month]);
});
test('parcela corrigida não redistribui diferença e edição futura preserva pagamento', () => {
  const store = fixture(); store.simpleAccounts = [];
  store.installmentPurchases.push({ id: 'inst', description: 'Sofá', totalAmount: 300, installmentsCount: 3, startMonth: '2026-08', createdAt: '' });
  const paid = recordPayment(store, month, 'inst', 'installment', 'pago', 112);
  assert.equal(computeMonthlyAccounts(month, paid)[0].amount, 112);
  assert.equal(computeMonthlyAccounts('2026-10', paid)[0].amount, 100);
  assert.equal(paid.installmentPurchases[0].totalAmount, 300);
  const updated = { ...paid, installmentPurchases: applyInstallmentUpdate(paid.installmentPurchases, 'inst', '2026-10', { description: 'Novo nome', totalAmount: 600, installmentsCount: 3, currentInstallment: 3 }) };
  assert.equal(computeMonthlyAccounts(month, updated)[0].amount, 112);
  assert.equal(computeMonthlyAccounts(month, updated)[0].status, 'pago');
});
test('cartão confere soma dos itens e rejeita total arbitrário', () => {
  const store = fixture(); store.simpleAccounts = [];
  store.creditCards.push({ id: 'card', name: 'Cartão', createdAt: '' });
  store.cardExpenses.push({ id: 'item', cardId: 'card', description: 'Compra', amount: 193.47, month, categoryId: 'home', createdAt: '' });
  assert.throws(() => recordPayment(store, month, 'card', 'credit_card', 'pago', 180), /calculado/);
  const paid = recordPayment(store, month, 'card', 'credit_card', 'pago', 193.47);
  assert.deepEqual(paid.cardExpenses, store.cardExpenses);
  const closed = closeMonth(paid, month);
  paid.cardExpenses[0].description = 'Outra compra';
  paid.creditCards[0].name = 'Outro cartão';
  assert.equal(computeMonthlyAccounts(month, closed)[0].cardInfo?.items[0].description, 'Compra');
  assert.equal(computeMonthlyAccounts(month, closed)[0].name, 'Cartão');
});
test('fatura anterior não bloqueia fechamento, não é absorvida e pode ser paga depois', () => {
  const store = fixture(); store.simpleAccounts = [];
  store.creditCards.push({ id: 'card', name: 'Cartão', createdAt: '' });
  store.cardExpenses.push({ id: 'item', cardId: 'card', description: 'Compra antiga', amount: 100, month: '2026-08', createdAt: '' });
  const paid = recordPayment(store, month, 'card', 'credit_card', 'pago');
  const closed = closeMonth(paid, month);
  assert.deepEqual(closed.cardExpenses, store.cardExpenses);
  assert.deepEqual(closed.cardMonthlyInvoices, paid.cardMonthlyInvoices);
  assert.deepEqual(getPreviousPendingCardInvoices('card', '2026-10', closed), [{ month: '2026-08', amount: 100 }]);
  assert.equal(closed.closedMonths![month].summary.totalExpected, 0);
  assert.equal(closed.closedMonths![month].summary.totalPaid, 0);
  assert.equal(closed.closedMonths![month].summary.totalPending, 0);
  assert.equal(closed.closedMonths![month].summary.previousPendingCardsTotal, 100);
  assert.throws(() => closeMonth(closed, '2026-08'), /pendente/);
  const resolved = recordPayment(closed, '2026-08', 'card', 'credit_card', 'pago');
  assert.doesNotThrow(() => assertFinancialMutation(closed, resolved));
  assert.deepEqual(getPreviousPendingCardInvoices('card', '2026-10', resolved), []);
  assert.deepEqual(resolved.closedMonths, closed.closedMonths);
  assert.equal(computeOperationalMonthlyAccounts(month, resolved)[0].cardInfo?.previousPendingAmount, 0);
  assert.equal(computeMonthlyAccounts(month, resolved)[0].cardInfo?.previousPendingAmount, 100);
  assert.equal(computeFinancialSummary(month, resolved).totalPaid, 0);
});
test('Setembro: 8 pagas, R$ 4.844,90 fechados, R$ 5.110 anteriores preservados', () => {
  let raw: string | null = null;
  Object.defineProperty(globalThis, 'localStorage', { value: { getItem: () => raw, setItem: (_key: string, value: string) => { raw = value; } }, configurable: true });
  let store = loadFinanceStore();
  const debt = getPreviousPendingCardInvoices('card_nubank', month, store);
  for (const account of computeMonthlyAccounts(month, store)) store = recordPayment(store, month, account.id, account.type, 'pago');
  const closed = closeMonth(store, month);
  const summary = closed.closedMonths![month].summary;
  assert.equal(summary.totalCount, 8);
  assert.equal(summary.pendingCount, 0);
  assert.equal(Math.round(summary.totalExpected * 100), 484490);
  assert.equal(Math.round(summary.totalPaid * 100), 484490);
  assert.equal(summary.totalPending, 0);
  assert.equal(summary.previousPendingCardsTotal, 5110);
  assert.equal(Math.round(summary.categoryBreakdown.reduce((sum, c) => sum + c.total, 0) * 100), 484490);
  assert.deepEqual(getPreviousPendingCardInvoices('card_nubank', '2026-10', closed), debt);
  assert.deepEqual(closed.cardMonthlyInvoices, store.cardMonthlyInvoices);
  saveFinanceStore(closed);
  assert.deepEqual(getPreviousPendingCardInvoices('card_nubank', '2026-10', loadFinanceStore()), debt);
  assert.throws(() => closeMonth(closed, month), /fechado/);
  assert.throws(() => recordPayment(closed, month, 'card_nubank', 'credit_card', 'pendente'), /fechado/);
});
test('dados legados carregam sem reset e snapshots sobrevivem a reload', () => {
  let raw = JSON.stringify(fixture());
  const storage = { getItem: () => raw, setItem: (_key: string, value: string) => { raw = value; } };
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
  const old = loadFinanceStore();
  assert.equal(old.simpleAccounts[0].name, 'Havan');
  assert.deepEqual(old.closedMonths, {});
  const closed = closeMonth(recordPayment(old, month, 'simple', 'simple', 'pago', 193.47), month);
  saveFinanceStore(closed);
  assert.deepEqual(loadFinanceStore(), JSON.parse(JSON.stringify(closed)));
  storage.setItem = () => { throw new Error('quota'); };
  assert.throws(() => saveFinanceStore(closed), /Não foi possível salvar/);
});
