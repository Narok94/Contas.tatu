import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test, type TestContext } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { createFoundation } from '../server/foundation.js';
import { createRepository, type Transport, q } from '../server/finance/repository.js';
import { createFinanceService } from '../server/finance/service.js';

async function fixture(t: TestContext) {
  const pg = new PGlite(); t.after(() => pg.close());
  await pg.exec(readFileSync(new URL('../database/migrations/001_finance_v2.sql', import.meta.url), 'utf8'));
  const transport: Transport = { async batch(queries, readOnly) {
    return pg.transaction(async tx => {
      if (readOnly) await tx.exec('SET TRANSACTION READ ONLY');
      const results = [];
      for (const query of queries) results.push((await tx.query(query.text, query.values)).rows);
      return results as any;
    });
  } };
  await createFoundation({ transaction: (qs, ro = false) => transport.batch(qs, ro) }).initialize();
  const repository = createRepository(transport); const service = createFinanceService(repository);
  const run = async (action: string, month: string, data: object = {}) => service.execute({ action, month, data, expectedRevision: (await repository.load()).revision });
  const view = (month: string) => service.read(month);
  return { pg, transport, repository, service, run, view };
}

test('SQL: simple account creation, edit, paid value, archive and stable IDs', async t => {
  const f = await fixture(t);
  let r = await f.run('simple.create', '2026-09', { name: 'Luz', value: 100 });
  const id = r.state.simpleAccounts[0].id;
  r = await f.run('simple.edit', '2026-09', { id, name: 'Luz casa', value: 120 });
  assert.equal(r.state.simpleAccounts[0].id, id);
  await f.run('payment', '2026-09', { id, type: 'simple', status: 'pago', amount: 125 });
  assert.equal((await f.view('2026-09')).summary.totalPaid, 125);
  await assert.rejects(f.run('payment', '2026-09', { id, type: 'simple', status: 'parcial', amount: 50 }));
  await f.run('simple.archive', '2026-09', { id });
  assert.equal((await f.view('2026-09')).accounts.length, 0);
  const rows = (await f.pg.query('SELECT id,archived_at FROM finance_v2.simple_accounts')).rows as any[];
  assert.equal(rows.length, 1); assert.equal(rows[0].id, id); assert.ok(rows[0].archived_at);
});

test('SQL: recurring monthly independence, virtual zero, payments and archival', async t => {
  const f = await fixture(t);
  const r = await f.run('recurring.create', '2026-08', { name: 'Energia', initialValue: 80 });
  const id = r.state.recurringDefinitions[0].id;
  assert.equal((await f.view('2026-09')).accounts[0].amount, 0);
  await f.run('recurring.edit', '2026-09', { id, name: 'Energia', value: 112 });
  await f.run('payment', '2026-09', { id, type: 'recurring', status: 'pago' });
  assert.equal((await f.view('2026-08')).accounts[0].amount, 80);
  assert.equal((await f.view('2026-09')).summary.totalPaid, 112);
  assert.equal((await f.view('2026-10')).accounts[0].amount, 0);
  assert.equal((await f.pg.query('SELECT * FROM finance_v2.recurring_monthly_records')).rows.length, 2);
  await f.run('recurring.archive', '2026-10', { id });
  assert.equal((await f.view('2026-10')).accounts.length, 0);
});

test('SQL: consecutive partial invoices carry only 100 then 500; full payment clears all', async t => {
  const f = await fixture(t);
  const card = (await f.run('card.create', '2026-08', { name: 'Cartão' })).state.creditCards[0].id;
  await f.run('expense.create', '2026-08', { cardId: card, description: 'Agosto', amount: 1000 });
  await f.run('payment', '2026-08', { id: card, type: 'credit_card', status: 'parcial', amount: 900 });
  await f.run('expense.create', '2026-09', { cardId: card, description: 'Setembro', amount: 1900 });
  assert.equal((await f.view('2026-09')).accounts[0].amount, 2000);
  await f.run('payment', '2026-09', { id: card, type: 'credit_card', status: 'parcial', amount: 1500 });
  let october = await f.view('2026-10');
  assert.equal(october.accounts[0].amount, 500);
  assert.deepEqual(october.accounts[0].cardInfo?.previousPendingInvoices, [{ month: '2026-09', amount: 500 }]);
  assert.equal(october.annual.total, 2400);
  await f.run('payment', '2026-10', { id: card, type: 'credit_card', status: 'pago' });
  assert.equal((await f.view('2026-11')).accounts[0].amount, 0);
  assert.equal((await f.view('2026-10')).annual.total, 2900);
  const invoiceCount = (await f.pg.query('SELECT * FROM finance_v2.card_monthly_invoices')).rows.length;
  await f.run('payment', '2026-10', { id: card, type: 'credit_card', status: 'pago' });
  assert.equal((await f.pg.query('SELECT * FROM finance_v2.card_monthly_invoices')).rows.length, invoiceCount);
});

test('SQL: standalone installment, uniform cents, future cancellation and no materialized calendar', async t => {
  const f = await fixture(t);
  let r = await f.run('installment.create', '2026-01', { description: 'Compra', totalAmount: 100, installmentsCount: 3 });
  const id = r.state.installmentPurchases[0].id;
  assert.equal((await f.view('2026-01')).accounts[0].amount, 33.33);
  assert.equal((await f.view('2026-02')).accounts[0].installmentInfo?.remainingInstallments, 1);
  await f.run('payment', '2026-01', { id, type: 'installment', status: 'pago' });
  await f.run('installment.cancel', '2026-02', { id, reason: 'Cancelamento futuro' });
  assert.equal((await f.view('2026-01')).summary.totalPaid, 33.33);
  assert.equal((await f.view('2026-02')).accounts.length, 0);
  await f.run('installment.create', '2026-01', { description: 'Plano longo', totalAmount: 130, installmentsCount: 130 });
  assert.equal((await f.pg.query('SELECT * FROM finance_v2.installment_versions')).rows.length, 3);
  assert.equal((await f.pg.query('SELECT * FROM finance_v2.installment_month_snapshots')).rows.length, 0);
  assert.equal((await f.pg.query('SELECT * FROM finance_v2.installment_month_states')).rows.length, 1);
});

test('SQL: card to standalone and back preserves past configuration after reload', async t => {
  const f = await fixture(t);
  const card = (await f.run('card.create', '2026-01', { name: 'Cartão' })).state.creditCards[0].id;
  const id = (await f.run('installment.create', '2026-01', { description: 'Compra', totalAmount: 1200, installmentsCount: 12, creditCardId: card })).state.installmentPurchases[0].id;
  const before = (await f.view('2026-06')).accounts;
  await f.run('installment.change', '2026-07', { id, description: 'Compra', totalAmount: 1200, installmentsCount: 12, currentInstallment: 7, creditCardId: '', reason: 'Avulso' });
  assert.deepEqual((await f.view('2026-06')).accounts, before);
  assert.equal((await f.view('2026-07')).accounts.find(a => a.type === 'installment')?.amount, 100);
  await f.run('installment.change', '2026-10', { id, description: 'Compra', totalAmount: 1200, installmentsCount: 12, currentInstallment: 10, creditCardId: card, reason: 'Cartão' });
  assert.equal((await f.view('2026-10')).accounts.find(a => a.type === 'installment'), undefined);
  assert.equal((await f.view('2026-07')).accounts.find(a => a.type === 'installment')?.amount, 100);
  await assert.rejects(f.run('card.archive', '2026-10', { id: card }));
});

for (const useCard of [false, true]) test(`SQL: payoff ${useCard ? 'card' : 'standalone'} counts payment once and ends future`, async t => {
  const f = await fixture(t);
  const card = useCard ? (await f.run('card.create', '2026-01', { name: 'Cartão' })).state.creditCards[0].id : undefined;
  const id = (await f.run('installment.create', '2026-01', { description: 'Compra', totalAmount: 1000, installmentsCount: 10, creditCardId: card })).state.installmentPurchases[0].id;
  for (let i = 1; i <= 6; i++) await f.run('payment', `2026-0${i}`, { id: card ?? id, type: useCard ? 'credit_card' : 'installment', status: 'pago' });
  assert.equal((await f.service.payoffQuote(id, '2026-07')).amount, 400);
  await f.run('installment.payoff', '2026-07', { id, amount: 400, reason: 'Quitação confirmada' });
  const july = await f.view('2026-07');
  assert.equal(july.summary.totalPaid, 400); assert.equal(july.annual.total, 1000);
  assert.equal((await f.view('2026-08')).summary.totalExpected, 0);
  await assert.rejects(f.run('payment', '2026-07', { id: card ?? id, type: useCard ? 'credit_card' : 'installment', status: 'pendente' }));
});

test('SQL: closure, reopen, retroactive correction, immutable versions and paid-only history', async t => {
  const f = await fixture(t);
  const id = (await f.run('installment.create', '2026-01', { description: 'Compra', totalAmount: 1200, installmentsCount: 12 })).state.installmentPurchases[0].id;
  await f.run('payment', '2026-09', { id, type: 'installment', status: 'pago' });
  await f.run('month.close', '2026-09');
  const original = (await f.view('2026-09')).state.closedMonths!['2026-09'];
  const correction = { id, description: 'Corrigida', totalAmount: 2400, installmentsCount: 12, currentInstallment: 9, reason: 'Correção explícita' };
  await assert.rejects(f.run('installment.correct', '2026-09', correction));
  await assert.rejects(f.run('simple.create', '2026-09', { name: 'Bloqueada', value: 1 }));
  await f.run('month.reopen', '2026-09');
  await f.run('installment.correct', '2026-09', correction);
  assert.equal((await f.view('2026-09')).summary.totalPaid, 100);
  await f.run('payment', '2026-09', { id, type: 'installment', status: 'pendente' });
  await f.run('payment', '2026-09', { id, type: 'installment', status: 'pago', amount: 200 });
  await f.run('month.close', '2026-09');
  const result = await f.view('2026-09');
  assert.equal(result.summary.totalPaid, 200); assert.equal(result.annual.total, 200);
  assert.deepEqual(result.state.closedMonthHistory!['2026-09'], [original]);
  assert.equal((await f.view('2026-10')).accounts[0].amount, 100);
  assert.equal((await f.pg.query('SELECT * FROM finance_v2.month_closures')).rows.length, 2);
  assert.equal((await f.pg.query('SELECT * FROM finance_v2.month_reopenings')).rows.length, 1);
  await assert.rejects(f.pg.exec('UPDATE finance_v2.month_closures SET revision=99'));
  await assert.rejects(f.pg.exec('DELETE FROM finance_v2.installment_versions'));
});

test('SQL: stale/concurrent revisions reject atomically; FKs and failed writes roll back', async t => {
  const f = await fixture(t);
  const before = await f.repository.load();
  const command = { action: 'simple.create', month: '2026-09', expectedRevision: before.revision, data: { name: 'One', value: 1 } };
  const outcomes = await Promise.allSettled([f.service.execute(command), f.service.execute(command)]);
  assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal((await f.repository.load()).store.simpleAccounts.length, 1);
  const loaded = await f.repository.load();
  const bad = structuredClone(loaded.store);
  bad.simpleAccounts[0].categoryId = '11111111-1111-4111-8111-111111111111';
  await assert.rejects(f.repository.save(loaded, bad));
  assert.equal((await f.repository.load()).revision, loaded.revision);
  assert.equal((await f.repository.load()).store.simpleAccounts[0].categoryId, undefined);
  await assert.rejects(f.transport.batch([
    q("UPDATE finance_v2.households SET name='Must rollback'"), q('SELECT 1/0'),
  ], false));
  assert.equal((await f.pg.query('SELECT name FROM finance_v2.households')).rows[0].name, 'Contas Tatu');
});

test('SQL: invalid money, references, dates and household injection never change state', async t => {
  const f = await fixture(t); const before = await f.repository.load();
  for (const value of [-1, 1.001, Infinity, 1e15]) await assert.rejects(f.run('simple.create', '2026-09', { name: 'Invalid', value }));
  await assert.rejects(f.run('simple.create', '2026-09', { name: 'Invalid', value: 1, household_id: 'arbitrary' }));
  await assert.rejects(f.run('simple.create', '0000-01', { name: 'Invalid', value: 1 }));
  await assert.rejects(f.run('expense.create', '2026-09', { cardId: '11111111-1111-4111-8111-111111111111', description: 'No card', amount: 1 }));
  assert.equal((await f.repository.load()).revision, before.revision);
  assert.equal((await f.repository.load()).store.simpleAccounts.length, 0);
});
