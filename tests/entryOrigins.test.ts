import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { createFoundation, DEFAULT_HOUSEHOLD_ID } from '../server/foundation.js';
import { createRepository, type Transport } from '../server/finance/repository.js';
import { createFinanceService } from '../server/finance/service.js';
import { accountMetadata, compareCreatedAt, entryMetadata } from '../src/utils/entryOrigins.js';

test('creation author is authenticated, immutable across edits/payments and persists after reload and archival', async t => {
  const pg = new PGlite(); t.after(() => pg.close());
  for (const name of ['001_finance_v2', '004_mobile_payments', '005_entry_origins']) await pg.exec(readFileSync(`database/migrations/${name}.sql`, 'utf8'));
  const db: Transport = { batch: (queries, readOnly) => pg.transaction(async tx => {
    if (readOnly) await tx.exec('SET TRANSACTION READ ONLY');
    const rows = [];
    for (const query of queries) rows.push((await tx.query(query.text, query.values)).rows);
    return rows;
  }) };
  await createFoundation({ transaction: (queries, ro = false) => db.batch(queries, ro) }).initialize();
  const henrique = randomUUID(), jessica = randomUUID();
  for (const [id, name] of [[henrique, 'Henrique'], [jessica, 'Jéssica']]) {
    await pg.query('INSERT INTO finance_v2.app_users (id,auth_issuer,auth_subject,display_name) VALUES ($1,$2,$4,$3)', [id, 'test', name, id]);
    await pg.query('INSERT INTO finance_v2.household_memberships(household_id,user_id,role) VALUES ($1,$2,$3)', [DEFAULT_HOUSEHOLD_ID, id, 'owner']);
  }
  const service = createFinanceService(createRepository(db));
  const run = async (action: string, data: object, actor?: string) => service.execute({ action, data, month: '2026-11', expectedRevision: (await service.read('2026-11')).revision }, actor);
  const created = await run('simple.create', { name: 'Internet', value: 100 }, henrique);
  const id = created.state.simpleAccounts[0].id;
  assert.equal(entryMetadata(created.state, 'simple', id).authorName, 'Henrique');
  const initialOrigin = (await service.read('2026-11')).state.entryOrigins![0];
  assert.equal(Date.parse(initialOrigin.createdAt), Date.parse(created.state.entryOrigins![0].createdAt));
  await run('simple.edit', { id, name: 'Internet editada', value: 110 }, jessica);
  await run('payment', { id, type: 'simple', status: 'pago' }, jessica);
  let view = await service.read('2026-11');
  assert.deepEqual(view.state.entryOrigins![0], initialOrigin);
  assert.equal(accountMetadata(view.state, view.accounts[0]).authorId, henrique);
  await assert.rejects(run('simple.create', { name: 'Forjada', value: 1, actorId: jessica }, henrique));
  await assert.rejects(run('simple.create', { name: 'Fora da casa', value: 1 }, randomUUID()));
  const legacy = await run('simple.create', { name: 'Legado sem autor', value: 10 });
  const legacyId = legacy.state.simpleAccounts[0].id;
  await run('simple.edit', { id: legacyId, name: 'Legado editado', value: 20 }, jessica);
  view = await service.read('2026-11');
  assert.equal(entryMetadata(view.state, 'simple', legacyId).authorId, undefined);

  const card = (await run('card.create', { name: 'Cartão' }, henrique)).state.creditCards[0].id;
  const expense = (await run('expense.create', { cardId: card, description: 'Mercado', amount: 50 }, jessica)).state.cardExpenses[0].id;
  await run('expense.edit', { id: expense, cardId: card, description: 'Mercado editado', amount: 60 }, henrique);
  const recurring = (await run('recurring.create', { name: 'Aluguel', initialValue: 200 }, jessica)).state.recurringDefinitions[0].id;
  const installment = (await run('installment.create', { description: 'Sofá', totalAmount: 300, installmentsCount: 3 }, henrique)).state.installmentPurchases[0].id;
  view = await service.read('2026-11');
  assert.equal(entryMetadata(view.state, 'credit_card', card).authorName, 'Henrique');
  assert.equal(entryMetadata(view.state, 'simple_expense', expense).authorName, 'Jéssica');
  assert.equal(entryMetadata(view.state, 'recurring', recurring).authorName, 'Jéssica');
  assert.equal(entryMetadata(view.state, 'installment', installment).authorName, 'Henrique');
  await run('simple.archive', { id }, jessica);
  assert.deepEqual((await service.read('2026-11')).state.entryOrigins!.find(row => row.entryId === id), initialOrigin);
  // Migration can be rerun; initial installment authors can be recovered without guessing.
  await pg.query('DELETE FROM finance_v2.entry_origins WHERE entry_id=$1', [installment]);
  await pg.exec(readFileSync('database/migrations/005_entry_origins.sql', 'utf8'));
  await pg.exec(readFileSync('database/migrations/005_entry_origins.sql', 'utf8'));
  assert.equal(entryMetadata((await service.read('2026-11')).state, 'installment', installment).authorName, 'Henrique');
});

test('date ordering uses timestamps, keeps missing dates last, and handles equivalent timezone offsets', () => {
  const dates = [undefined, '2026-11-01T01:00:00Z', 'invalid', '2026-10-31T23:00:00-03:00'];
  assert.deepEqual([...dates].sort((a, b) => compareCreatedAt(a, b, 'newest')).slice(0, 2), [dates[3], dates[1]]);
  assert.deepEqual([...dates].sort((a, b) => compareCreatedAt(a, b, 'oldest')).slice(0, 2), [dates[1], dates[3]]);
  assert.equal(compareCreatedAt('2026-11-01T02:00:00Z', dates[3], 'newest'), 0);
});
