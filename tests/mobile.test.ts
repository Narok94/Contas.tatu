import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { createFoundation } from '../server/foundation.js';
import { createRepository, type Transport } from '../server/finance/repository.js';
import { createFinanceService } from '../server/finance/service.js';
import { recentEntries, monthlyEntries, parseMobileMoney, canQuickEdit } from '../src/mobile/model.js';
import type { FinanceDataStore } from '../src/domain/financeRules.js';

const empty = (): FinanceDataStore => ({ categories: [], creditCards: [], simpleAccounts: [], recurringDefinitions: [], recurringMonthlyRecords: [], installmentPurchases: [], cardExpenses: [], cardMonthlyInvoices: [] });
test('mobile recent projection is empty without API data and sorts persisted entries without demos', () => {
  const s = empty(); assert.deepEqual(recentEntries(s), []);
  s.simpleAccounts.push({ id: 'a', name: 'Conta', value: 12, month: '2026-09', status: 'pago', createdAt: '2026-09-01' });
  s.cardExpenses.push({ id: 'b', cardId: 'card', description: 'Compra', amount: 20, month: '2026-09', createdAt: '2026-09-02' });
  s.installmentPurchases.push({ id: 'c', description: 'Plano', totalAmount: 30, installmentsCount: 3, startMonth: '2026-09', createdAt: '2026-09-03' });
  const before = JSON.stringify(s); const rows = recentEntries(s);
  assert.deepEqual(rows.map(r => r.id), ['c', 'b', 'a']); assert.equal(rows[0].badge, '3x'); assert.equal(rows[2].badge, 'Paga');
  assert.equal(JSON.stringify(s), before);
});
test('mobile quick edits restrict historical/advanced changes and preserve monthly payment owner', () => {
  const s = empty(); const rows = monthlyEntries([{ id: 'card', name: 'Cartão', amount: 500, status: 'parcial', type: 'credit_card' }], '2026-10');
  assert.equal(rows[0].amount, 500); assert.equal(rows[0].badge, 'Parcial'); assert.equal(rows[0].month, '2026-10');
  assert.equal(canQuickEdit(rows[0], s), false);
  const simple = { ...rows[0], kind: 'simple' as const }; assert.equal(canQuickEdit(simple, s), true);
  s.closedMonths = { '2026-10': {} as any }; assert.equal(canQuickEdit(simple, s), false);
});
test('mobile decimal keyboard parser accepts comma and dot but never guesses grouping or truncates cents', () => {
  assert.equal(parseMobileMoney('186,40'), 186.4); assert.equal(parseMobileMoney(' 12.50 '), 12.5);
  for (const value of ['', '0', '-2', '1.234,56', '1,999', 'Infinity', '1e2', '99999999999999']) assert.equal(parseMobileMoney(value), null);
});
test('mobile paid account create/edit uses one revision, atomic SQL and existing closed-month safeguards', async t => {
  const pg = new PGlite(); t.after(() => pg.close());
  await pg.exec(readFileSync(new URL('../database/migrations/001_finance_v2.sql', import.meta.url), 'utf8'));
  await pg.exec(readFileSync(new URL('../database/migrations/004_mobile_payments.sql', import.meta.url), 'utf8'));
  const transport: Transport = { batch: (queries, ro) => pg.transaction(async tx => {
    if (ro) await tx.exec('SET TRANSACTION READ ONLY'); const rows = [];
    for (const q of queries) rows.push((await tx.query(q.text, q.values)).rows); return rows as any;
  }) };
  await createFoundation({ transaction: (qs, ro = false) => transport.batch(qs, ro) }).initialize();
  const service = createFinanceService(createRepository(transport));
  const run = async (action: string, data: object = {}, revision?: string) => service.execute({ action, month: '2026-09', data, expectedRevision: revision ?? (await service.read('2026-09')).revision });
  const revision = (await service.read('2026-09')).revision;
  const created = await run('simple.create', { name: 'Mercado', value: 186.4, paid: true }, revision);
  assert.equal(BigInt(created.revision), BigInt(revision) + 1n); assert.equal(created.state.simpleAccounts[0].status, 'pago');
  const id = created.state.simpleAccounts[0].id;
  await assert.rejects(run('simple.create', { name: 'Duplicada', value: 10, paid: true }, revision));
  await run('simple.edit', { id, name: 'Mercado editado', value: 200, paid: false });
  assert.equal((await service.read('2026-09')).accounts[0].status, 'pendente');
  await run('simple.edit', { id, name: 'Mercado editado', value: 201, paid: true });
  assert.equal((await service.read('2026-09')).summary.totalPaid, 201);
  await assert.rejects(run('simple.create', { name: 'Inválida', value: 10, paid: 'true' }));
  await run('month.close'); await assert.rejects(run('simple.edit', { id, name: 'Bloqueada', value: 500, paid: true }));
  assert.equal((await service.read('2026-09')).state.simpleAccounts.length, 1);
  assert.equal((await service.read('2026-09')).summary.totalPaid, 201);
});

test('mobile payments persist actual amounts, settle balances and transfer exactly once', async t => {
  const pg = new PGlite(); t.after(() => pg.close());
  for (const migration of ['001_finance_v2', '004_mobile_payments']) {
    await pg.exec(readFileSync(`database/migrations/${migration}.sql`, 'utf8'));
  }
  const transport: Transport = { batch: (queries, readOnly) => pg.transaction(async tx => {
    if (readOnly) await tx.exec('SET TRANSACTION READ ONLY');
    const rows = [];
    for (const query of queries) rows.push((await tx.query(query.text, query.values)).rows);
    return rows as Record<string, unknown>[][];
  }) };
  await createFoundation({ transaction: (queries, readOnly = false) => transport.batch(queries, readOnly) }).initialize();
  const actor = (await pg.query<{ id: string }>('SELECT id FROM finance_v2.app_users')).rows[0].id;
  const service = createFinanceService(createRepository(transport));
  const current = '2026-11', next = '2026-12', following = '2027-01';
  const run = async (action: string, month: string, data: object, revision?: string) =>
    service.execute({ action, month, data, expectedRevision: revision ?? (await service.read(month)).revision }, actor);
  const input = (id: string, type: string, amount: number, expectedOpen: number, transfer = false) =>
    ({ requestId: randomUUID(), id, type, amount, expectedOpen, transfer });

  const source = (await run('simple.create', current, { name: 'Internet', value: 200, notes: 'Local: Provedor' })).state.simpleAccounts[0].id;
  const destination = (await run('simple.create', next, { name: 'Internet', value: 80 })).state.simpleAccounts[0].id;
  const first = input(source, 'simple', 50, 200);
  await run('payment.mobile', current, first);
  assert.equal((await service.read(current)).summary.totalPaid, 50);
  assert.equal((await service.read(current)).summary.totalPending, 150);
  assert.equal((await service.read(next)).summary.totalPending, 80);

  const second = input(source, 'simple', 30, 150, true);
  const revision = (await service.read(current)).revision;
  await run('payment.mobile', current, second, revision);
  await run('payment.mobile', current, second, revision);
  await assert.rejects(run('payment.mobile', current, { ...second, amount: 40 }, revision));
  await assert.rejects(run('payment.mobile', current, input(source, 'simple', 5, 150)));
  const settled = await service.read(current);
  assert.equal(settled.summary.totalPaid, 80);
  assert.equal(settled.summary.totalPending, 0);
  assert.equal(settled.state.mobilePayments?.length, 2);
  assert.equal(settled.state.mobilePayments?.find(row => row.id === second.requestId)?.location, 'Provedor');
  const transferred = await service.read(next);
  assert.equal(transferred.accounts.filter(a => a.type === 'simple').length, 1);
  assert.equal(transferred.accounts.find(a => a.id === destination)?.amount, 200);
  assert.equal(transferred.state.mobilePayments?.find(row => row.id === second.requestId)?.targetId, destination);
  await run('payment.mobile', next, input(destination, 'simple', 200, 200));
  assert.equal((await service.read(next)).summary.totalPaid, 200);

  const lone = (await run('simple.create', current, { name: 'Água', value: 100 })).state.simpleAccounts[0].id;
  await run('payment.mobile', current, input(lone, 'simple', 40, 100, true));
  const fallback = (await service.read(next)).accounts.find(a => a.name === 'Água');
  assert.equal(fallback?.amount, 60);
  await assert.rejects(run('simple.archive', next, { id: fallback?.id }));

  const recurring = (await run('recurring.create', current, { name: 'Aluguel', initialValue: 200 })).state.recurringDefinitions[0].id;
  await run('recurring.edit', next, { id: recurring, name: 'Aluguel', value: 220 });
  await run('payment.mobile', current, input(recurring, 'recurring', 180, 200, true));
  assert.equal((await service.read(next)).accounts.find(a => a.id === recurring)?.amount, 240);

  const card = (await run('card.create', current, { name: 'Cartão' })).state.creditCards[0].id;
  await run('expense.create', current, { cardId: card, description: 'Compras', amount: 150 });
  await run('expense.create', next, { cardId: card, description: 'Compras', amount: 90 });
  await run('payment.mobile', current, input(card, 'credit_card', 40, 150));
  const invoice = async (month: string) => (await service.read(month)).accounts.find(a => a.id === card);
  assert.equal((await invoice(current))?.cardInfo?.totalOpenAmount, 110);
  assert.equal((await invoice(next))?.cardInfo?.totalOpenAmount, 90);
  await run('payment.mobile', current, input(card, 'credit_card', 20, 110, true));
  assert.equal((await invoice(current))?.cardInfo?.totalOpenAmount, 0);
  assert.equal((await invoice(next))?.cardInfo?.totalOpenAmount, 180);
  await run('payment.mobile', next, input(card, 'credit_card', 180, 180));
  assert.equal((await invoice(following))?.cardInfo?.totalOpenAmount, 0);
});
