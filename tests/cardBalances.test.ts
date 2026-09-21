import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeMonthlyAccounts, computeOperationalMonthlyAccounts, computeFinancialSummary, getPreviousPendingCardInvoices, FinanceDataStore } from '../src/domain/financeRules';
import { recordPayment, closeMonth, reopenMonth, canCloseMonth } from '../src/domain/monthOperations';
import { computeAnnualHistory } from '../src/domain/history';
import { loadFinanceStore, saveFinanceStore } from '../src/services/financeStorage';

function fixture(): FinanceDataStore {
  return { categories: [], simpleAccounts: [], recurringDefinitions: [], recurringMonthlyRecords: [],
    installmentPurchases: [], creditCards: [{ id: 'card', name: 'Cartão', createdAt: '' }],
    cardExpenses: [{ id: 'aug', cardId: 'card', month: '2026-08', amount: 1000, description: 'Agosto', createdAt: '' },
      { id: 'sep', cardId: 'card', month: '2026-09', amount: 1900, description: 'Setembro', createdAt: '' }],
    cardMonthlyInvoices: [] };
}
const invoice = (store: FinanceDataStore, month: string) => computeMonthlyAccounts(month, store)[0];
const pay = (store: FinanceDataStore, month: string, amount?: number) => recordPayment(store, month, 'card', 'credit_card', 'pago', amount);
const carry = (store: FinanceDataStore, month: string) => getPreviousPendingCardInvoices('card', month, store);

test('integral de R$ 1.000 é imediato e não leva saldo ao próximo mês', () => {
  const store = pay(fixture(), '2026-08');
  assert.equal(invoice(store, '2026-08').cardInfo!.paidAmount, 1000);
  assert.equal(invoice(store, '2026-08').cardInfo!.totalOpenAmount, 0);
  assert.equal(invoice(store, '2026-08').status, 'pago');
  assert.deepEqual(carry(store, '2026-09'), []);
});

test('parcial 900 deixa 100; 1.900 + 100 = 2.000; pagar 1.500 deixa somente 500', () => {
  let store = pay(fixture(), '2026-08', 900);
  const august = structuredClone(invoice(store, '2026-08'));
  assert.equal(august.status, 'parcial');
  assert.equal(august.amount, 1000);
  assert.equal(august.cardInfo!.totalOpenAmount, 100);
  assert.deepEqual(carry(store, '2026-09'), [{ month: '2026-08', amount: 100 }]);
  assert.equal(invoice(store, '2026-09').amount, 2000);
  store = pay(store, '2026-09', 1500);
  assert.equal(invoice(store, '2026-09').status, 'parcial');
  assert.deepEqual(carry(store, '2026-10'), [{ month: '2026-09', amount: 500 }]);
  assert.equal(invoice(store, '2026-10').amount, 500);
  assert.deepEqual(invoice(store, '2026-08'), august);
  assert.equal(store.simpleAccounts.length, 0);
  assert.equal(store.cardExpenses.length, 2);
});

test('parciais sucessivos substituem o saldo e atravessam o ano sem duplicar', () => {
  let store = pay(pay(fixture(), '2026-08', 900), '2026-09', 1500);
  for (const [month, paid, next, expected] of [
    ['2026-10', 100, '2026-11', 400], ['2026-11', 100, '2026-12', 300],
    ['2026-12', 200, '2027-01', 100], ['2027-01', 100, '2027-02', 0],
  ] as const) {
    store = pay(store, month, paid);
    assert.deepEqual(carry(store, next), expected ? [{ month, amount: expected }] : []);
  }
  assert.equal(computeAnnualHistory(2026, store).total, 2800);
  assert.equal(computeAnnualHistory(2027, store).total, 100);
});

test('integral com saldo anterior paga 2.000 e zera o transporte', () => {
  const store = pay(pay(fixture(), '2026-08', 900), '2026-09');
  assert.equal(invoice(store, '2026-09').cardInfo!.paidAmount, 2000);
  assert.equal(invoice(store, '2026-09').cardInfo!.totalOpenAmount, 0);
  assert.equal(invoice(store, '2026-09').status, 'pago');
  assert.deepEqual(carry(store, '2026-10'), []);
  assert.equal(computeAnnualHistory(2026, store).total, 2900);
});

test('compras e parcelas internas não viram contas nem dívidas individuais', () => {
  const initial = fixture(); initial.cardExpenses = [];
  initial.installmentPurchases.push({ id: 'purchase', description: 'Compra', totalAmount: 2000,
    installmentsCount: 2, startMonth: '2026-08', creditCardId: 'card', createdAt: '' });
  const store = pay(initial, '2026-08', 900);
  assert.equal(computeMonthlyAccounts('2026-09', store).length, 1);
  const card = invoice(store, '2026-09');
  assert.equal(card.amount, 1100);
  assert.equal(card.cardInfo!.items.length, 1);
  assert.equal(card.cardInfo!.items[0].amount, 1000);
  assert.deepEqual(card.cardInfo!.previousPendingInvoices, [{ month: '2026-08', amount: 100 }]);
  assert.deepEqual(store.installmentPurchases, initial.installmentPurchases);
});

test('resumo e anual somam dinheiro pago uma vez, sem somar o saldo novamente', () => {
  const store = pay(pay(fixture(), '2026-08', 900), '2026-09', 1500);
  const august = computeFinancialSummary('2026-08', store);
  const september = computeFinancialSummary('2026-09', store);
  assert.equal(august.totalPaid, 900);
  assert.equal(august.totalPending, 100);
  assert.equal(september.totalExpected, 2000);
  assert.equal(september.totalPaid, 1500);
  assert.equal(september.totalPending, 500);
  assert.equal(september.totalOpenWithPreviousPending, 500);
  assert.equal(computeFinancialSummary('2026-10', store).totalPaid, 0);
  assert.equal(computeAnnualHistory(2026, store).total, 2400);
});

test('reload preserva pagamento parcial, saldo consolidado e histórico', () => {
  const store = pay(pay(fixture(), '2026-08', 900), '2026-09', 1500);
  let raw = '';
  Object.defineProperty(globalThis, 'localStorage', { configurable: true,
    value: { getItem: () => raw, setItem: (_key: string, value: string) => { raw = value; } } });
  saveFinanceStore(store);
  const loaded = loadFinanceStore();
  assert.deepEqual(loaded.cardMonthlyInvoices, store.cardMonthlyInvoices);
  assert.deepEqual(carry(loaded, '2026-10'), [{ month: '2026-09', amount: 500 }]);
  assert.equal(computeAnnualHistory(2026, loaded).total, 2400);
});

test('parcial bloqueia fechamento; fechar e reabrir quitação posterior não recria dívidas', () => {
  let store = pay(pay(fixture(), '2026-08', 900), '2026-09', 1500);
  assert.equal(canCloseMonth(store, '2026-09'), false);
  assert.throws(() => closeMonth(store, '2026-09'), /pendente/);
  const september = invoice(store, '2026-09');
  store = closeMonth(pay(store, '2026-10'), '2026-10');
  const snapshot = structuredClone(store.closedMonths!['2026-10']);
  assert.deepEqual(carry(store, '2026-11'), []);
  store = reopenMonth(store, '2026-10');
  assert.deepEqual(store.closedMonthHistory!['2026-10'], [snapshot]);
  assert.deepEqual(invoice(store, '2026-09'), september);
  assert.deepEqual(carry(store, '2026-11'), []);
  store = closeMonth(store, '2026-10');
  assert.deepEqual(carry(store, '2026-11'), []);
  assert.equal(computeAnnualHistory(2026, store).total, 2900);
});

test('pagamentos parciais no mesmo mês são totais acumulados idempotentes', () => {
  const store = pay(fixture(), '2026-08', 900);
  assert.equal(pay(store, '2026-08', 900), store);
  const updated = pay(store, '2026-08', 950);
  assert.equal(updated.cardMonthlyInvoices.length, 1);
  assert.equal(computeFinancialSummary('2026-08', updated).totalPaid, 950);
  assert.deepEqual(carry(updated, '2026-09'), [{ month: '2026-08', amount: 50 }]);
  const paid = pay(updated, '2026-08');
  assert.equal(paid.cardMonthlyInvoices[0].paidAmount, 1000);
  assert.equal(pay(paid, '2026-08'), paid);
});

test('reversão limpa o pagamento, preserva compras e recompõe um único saldo', () => {
  const initial = fixture();
  const paid = pay(pay(initial, '2026-08', 900), '2026-09');
  const undone = recordPayment(paid, '2026-09', 'card', 'credit_card', 'pendente');
  assert.equal(invoice(undone, '2026-09').status, 'pendente');
  assert.equal(invoice(undone, '2026-09').cardInfo!.paidAmount, 0);
  assert.deepEqual(carry(undone, '2026-10'), [{ month: '2026-09', amount: 2000 }]);
  assert.deepEqual(undone.cardExpenses, initial.cardExpenses);
});

test('valores inválidos ou acima da fatura não modificam compras nem pagamentos', () => {
  const store = fixture(), before = structuredClone(store);
  for (const amount of [-1, NaN, Infinity, 1.001, 1000.01]) assert.throws(() => pay(store, '2026-08', amount));
  assert.throws(() => recordPayment(store, '2026-08', 'card', 'credit_card', 'parcial', 0));
  assert.deepEqual(store, before);
});

test('centavos não deixam resíduo em pagamentos sucessivos', () => {
  const initial = fixture(); initial.cardExpenses[0].amount = 0.3; initial.cardExpenses[1].amount = 0.1;
  let store = pay(initial, '2026-08', 0.1);
  assert.equal(invoice(store, '2026-09').amount, 0.3);
  store = pay(store, '2026-09', 0.2);
  assert.deepEqual(carry(store, '2026-10'), [{ month: '2026-09', amount: 0.1 }]);
  store = pay(store, '2026-10');
  assert.deepEqual(carry(store, '2026-11'), []);
  assert.equal(computeAnnualHistory(2026, store).total, 0.4);
});

test('meses sem compras recebem somente o saldo consolidado do mês anterior', () => {
  const store = pay(pay(fixture(), '2026-08', 900), '2026-09', 1500);
  assert.deepEqual(carry(store, '2027-03'), [{ month: '2027-02', amount: 500 }]);
  assert.equal(invoice(store, '2027-03').cardInfo!.items.length, 0);
});

test('saldo permanece isolado por cartão', () => {
  const initial = fixture();
  initial.creditCards.push({ id: 'other', name: 'Outro cartão', createdAt: '' });
  initial.cardExpenses.push({ ...initial.cardExpenses[0], id: 'other-aug', cardId: 'other', amount: 75 });
  const store = pay(initial, '2026-08', 900);
  assert.deepEqual(carry(store, '2026-09'), [{ month: '2026-08', amount: 100 }]);
  assert.deepEqual(getPreviousPendingCardInvoices('other', '2026-09', store), [{ month: '2026-08', amount: 75 }]);
});

test('nova compra após pagamento não mantém fatura paga com saldo restante', () => {
  const store = pay(fixture(), '2026-08');
  store.cardExpenses.push({ ...store.cardExpenses[0], id: 'late', amount: 25 });
  const card = invoice(store, '2026-08');
  assert.equal(card.amount, 1025);
  assert.equal(card.cardInfo!.paidAmount, 1000);
  assert.equal(card.cardInfo!.totalOpenAmount, 25);
  assert.equal(card.status, 'parcial');
  assert.deepEqual(carry(store, '2026-09'), [{ month: '2026-08', amount: 25 }]);
  assert.deepEqual(carry(pay(store, '2026-08'), '2026-09'), []);
});

test('parcelas antigas além de 120 meses não desaparecem da consolidação', () => {
  const store = fixture(); store.cardExpenses = [];
  store.installmentPurchases.push({ id: 'long', description: 'Compra antiga', totalAmount: 130,
    installmentsCount: 130, startMonth: '2010-01', creditCardId: 'card', createdAt: '' });
  assert.deepEqual(carry(store, '2026-09'), [{ month: '2026-08', amount: 130 }]);
});

test('legado consolida dívidas sem presumir pagamento de saldo anterior', () => {
  const store = fixture();
  store.cardMonthlyInvoices.push({ id: 'legacy', cardId: 'card', month: '2026-09', status: 'pago' });
  const before = structuredClone(store);
  assert.deepEqual(carry(store, '2026-10'), [{ month: '2026-09', amount: 1000 }]);
  assert.equal(invoice(store, '2026-09').status, 'parcial');
  assert.equal(invoice(store, '2026-09').cardInfo!.paidAmount, 1900);
  assert.equal(computeAnnualHistory(2026, store).total, 1900);
  assert.deepEqual(store, before);
  assert.deepEqual(carry(pay(store, '2026-10'), '2026-11'), []);
});

test('snapshot legado mantém valores oficiais, sem apagar dívida após fechamento ou reabertura', () => {
  const store = fixture();
  store.cardMonthlyInvoices.push({ id: 'legacy', cardId: 'card', month: '2026-09', status: 'pago' });
  const oldAccount = invoice(store, '2026-09');
  oldAccount.amount = 1900; oldAccount.status = 'pago';
  delete oldAccount.cardInfo!.paidAmount;
  const summary = computeFinancialSummary('2026-09', store);
  Object.assign(summary, { totalExpected: 1900, totalPaid: 1900, totalPending: 0, previousPendingCardsTotal: 1000, totalOpenWithPreviousPending: 1000 });
  store.closedMonths = { '2026-09': { month: '2026-09', closedAt: '', accounts: [oldAccount], summary } };
  const snapshot = structuredClone(store.closedMonths);
  assert.equal(computeFinancialSummary('2026-09', store).totalPaid, 1900);
  const operational = computeOperationalMonthlyAccounts('2026-09', store)[0];
  assert.equal(operational.amount, 1900);
  assert.equal(operational.status, 'pago');
  assert.equal(operational.cardInfo!.totalOpenAmount, 0);
  assert.deepEqual(operational.cardInfo!.previousPendingInvoices, []);
  assert.deepEqual(carry(store, '2026-10'), [{ month: '2026-09', amount: 1000 }]);
  const paid = pay(store, '2026-10');
  assert.deepEqual(paid.closedMonths, snapshot);
  assert.deepEqual(carry(reopenMonth(paid, '2026-09'), '2026-11'), []);
  assert.equal(computeAnnualHistory(2026, paid).total, 2900);
});
