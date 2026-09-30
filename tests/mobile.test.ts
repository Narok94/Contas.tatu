import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
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
