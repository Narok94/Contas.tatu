import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePhotoAccounts, photoAccountCommand } from '../src/mobile/photoAccounts';
import { installmentCommand } from '../server/finance/installments';
import { getInstallmentStatusForMonth } from '../src/domain/installmentTimeline';
import type { FinanceDataStore } from '../src/domain/financeRules';

test('OCR examples preserve store digits, installment position and monthly amount', () => {
  const rows = parsePhotoAccounts('Casas Bahia | 3/3 | R$ 500\nLoja 100 | 1/8 | R$ 345');
  assert.deepEqual(rows, [
    { name: 'Casas Bahia', current: '3', count: '3', amount: '500' },
    { name: 'Loja 100', current: '1', count: '8', amount: '345' },
  ]);
  const last = photoAccountCommand(rows[0], '2026-10');
  assert.equal(last.action, 'installment.create'); assert.equal(last.month, '2026-08');
  assert.deepEqual(last.data, { description: 'Casas Bahia', totalAmount: 1500, installmentsCount: 3, creditCardId: undefined, categoryId: undefined });
  const first = photoAccountCommand(rows[1], '2026-10');
  assert.equal(first.month, '2026-10'); assert.equal(first.total, 2760);
});
test('Brazilian thousands, decimals, multiline photo and simple accounts', () => {
  const rows = parsePhotoAccounts('Casas Bahia\n3 / 3\nR$ 1.234,56\nInternet | R$ 99,90');
  assert.equal(rows[0].name, 'Casas Bahia'); assert.equal(rows[0].amount, '1234,56');
  assert.equal(photoAccountCommand(rows[0], '2026-01').month, '2025-11');
  const simple = photoAccountCommand(rows[1], '2026-01');
  assert.equal(simple.action, 'simple.create'); assert.equal(simple.total, 99.9);
  assert.equal(parsePhotoAccounts('Loja | R$ 1.234')[0].amount, '1234');
  assert.equal(parsePhotoAccounts('Loja 100 | 1/8 | 345')[0].amount, '345');
});
test('uncertain reading remains editable and cannot silently become a valid account', () => {
  assert.deepEqual(parsePhotoAccounts(''), []);
  const row = parsePhotoAccounts('Loja 100')[0]; assert.equal(row.amount, '');
  assert.throws(() => photoAccountCommand(row, '2026-10'));
  for (const patch of [{ current: '4', count: '3' }, { current: '0', count: '3' }, { current: '1', count: '121' }, { current: '', count: '8' }, { amount: '-50' }, { amount: '0' }]) {
    assert.throws(() => photoAccountCommand({ name: 'Teste', current: '1', count: '3', amount: '500', ...patch }, '2026-10'));
  }
  assert.throws(() => photoAccountCommand({name:'Teste',current:'',count:'',amount:'50'}, 'invalid'));
  assert.throws(() => photoAccountCommand({name:'Teste',current:'1',count:'120',amount:'9999999999999'}, '2026-10'));
  assert.throws(() => parsePhotoAccounts(Array.from({length:21}, ()=>'Loja | R$ 10').join('\n')));
});
test('review changes generate only new creation commands and do not mutate the source', () => {
  const original = parsePhotoAccounts('Loja 100 | 1/8 | R$ 345')[0];
  const edited = { ...original, name: 'Loja revisada', amount: '350', current: '2' };
  const command = photoAccountCommand(edited, '2026-10');
  assert.equal(command.month, '2026-09'); assert.equal(command.total, 2800);
  assert.equal(original.name, 'Loja 100'); assert.equal(original.amount, '345');
});
test('existing installment creation resolves the photo installment and preserves prior records', () => {
  const store: FinanceDataStore = { categories: [], creditCards: [], simpleAccounts: [], recurringDefinitions: [], recurringMonthlyRecords: [], installmentPurchases: [], cardExpenses: [], cardMonthlyInvoices: [] };
  const rows = parsePhotoAccounts('Casas Bahia | 3/3 | R$ 500\nLoja 100 | 1/8 | R$ 345');
  const first = photoAccountCommand(rows[0], '2026-10');
  installmentCommand(store, first.action, first.month, first.data);
  const prior = JSON.stringify(store.installmentPurchases[0]);
  const lastStatus = getInstallmentStatusForMonth(store.installmentPurchases[0], '2026-10');
  assert.equal(lastStatus.currentInstallment, 3); assert.equal(lastStatus.installmentAmount, 500);
  const second = photoAccountCommand(rows[1], '2026-10');
  installmentCommand(store, second.action, second.month, second.data);
  assert.equal(JSON.stringify(store.installmentPurchases[0]), prior);
  const firstStatus = getInstallmentStatusForMonth(store.installmentPurchases[1], '2026-10');
  assert.equal(firstStatus.currentInstallment, 1); assert.equal(firstStatus.installmentAmount, 345);
});
