import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { createFoundation } from '../server/foundation.js';
import { createRepository, type Transport } from '../server/finance/repository.js';
import { createFinanceService } from '../server/finance/service.js';
import { createFinanceApi, FinanceSession, ApiError, type FinanceView } from '../src/services/financeApi.js';
import { localAccess } from '../server/category-api.js';
import { computeMonthlyAccounts } from '../src/domain/financeRules.js';
const empty = { categories: [], creditCards: [], simpleAccounts: [], recurringDefinitions: [], recurringMonthlyRecords: [], installmentPurchases: [], cardExpenses: [], cardMonthlyInvoices: [] };
const view = (month = '2026-09', revision = '0'): FinanceView => ({ month, revision, state: structuredClone(empty) });
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

test('client initial loading, empty API state, no local storage access or demo import', async t => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('Storage must not be accessed'); } });
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete (globalThis as any).localStorage; });
  let resolve!: (value: Response) => void; const requests: string[] = [];
  const session = new FinanceSession('2026-09', createFinanceApi((async url => { requests.push(String(url)); return new Promise(r => resolve = r); }) as typeof fetch));
  const pending = session.load(); assert.equal(session.snapshot.loading, true); assert.equal(session.snapshot.ready, false);
  resolve(response(view())); await pending;
  assert.equal(session.snapshot.loading, false); assert.equal(session.snapshot.ready, true);
  assert.deepEqual(session.snapshot.view?.state, empty); assert.deepEqual(requests, ['/api/finance?month=2026-09']);
});

test('client last month selection wins an out-of-order response', async () => {
  const requests: ((r: Response) => void)[] = [];
  const s = new FinanceSession('2026-09', createFinanceApi((async () => new Promise(r => requests.push(r))) as typeof fetch));
  const first = s.load(); const second = s.load('2026-10');
  requests[1](response(view('2026-10'))); await second;
  requests[0](response(view())); await first;
  assert.equal(s.snapshot.view?.month, '2026-10'); assert.equal(s.snapshot.month, '2026-10');
});

test('client revision conflict reloads, never retries or displays raw API secrets', async () => {
  let posts = 0; let reads = 0;
  const s = new FinanceSession('2026-09', createFinanceApi((async (_url, init) => {
    if (init?.method === 'POST') { posts++; assert.equal(JSON.parse(String(init.body)).expectedRevision, '1'); return response({ error: 'sensitive-database-details' }, 409); }
    return response(view('2026-09', String(++reads)));
  }) as typeof fetch));
  await s.load(); assert.equal(await s.command('simple.create', { name: 'Conta', value: 1 }), false);
  assert.equal(posts, 1); assert.equal(s.snapshot.view?.revision, '2'); assert.match(s.snapshot.error, /outra sessão/);
  assert.ok(!s.snapshot.error.includes('sensitive')); assert.equal(s.snapshot.month, '2026-09');
});

test('client prevents duplicate pending commands and refreshes after success', async () => {
  let release!: (value: Response) => void; let posts = 0;
  const s = new FinanceSession('2026-09', createFinanceApi((async (_url, init) => {
    if (init?.method === 'POST') { posts++; return new Promise(r => release = r); }
    return response(view('2026-09', String(posts)));
  }) as typeof fetch));
  await s.load(); const first = s.command('month.close');
  assert.equal(s.snapshot.busy, true); assert.equal(await s.command('month.close'), false);
  release(response({ status: 'ok' })); assert.equal(await first, true);
  assert.equal(posts, 1); assert.equal(s.snapshot.busy, false); assert.equal(s.snapshot.view?.revision, '1');
});

test('client unavailable or malformed API disables writes, allows retry, sanitizes network error', async () => {
  let bad = true;
  const s = new FinanceSession('2026-09', createFinanceApi((async () => { if (bad) throw new Error('sensitive'); return response(view()); }) as typeof fetch));
  assert.equal(await s.load(), false); assert.equal(await s.command('simple.create'), false);
  assert.ok(!s.snapshot.error.includes('sensitive')); bad = false;
  assert.equal(await s.load(), true);
  const api = createFinanceApi((async () => response({}, 500)) as typeof fetch);
  await assert.rejects(api.read('2026-09'), ApiError);
  const malformed = new FinanceSession('2026-09', createFinanceApi((async () => response({ month: '2026-09', revision: '0', state: {} })) as typeof fetch));
  assert.equal(await malformed.load(), false); assert.equal(malformed.snapshot.ready, false);
});

test('confirmed write with failed refresh does not invite resubmission and blocks writes until recovery', async () => {
  let written = false;
  const s = new FinanceSession('2026-09', createFinanceApi((async (_url, init) => {
    if (init?.method === 'POST') { written = true; return response({ status: 'ok' }); }
    return written ? response({}, 500) : response(view());
  }) as typeof fetch));
  await s.load(); assert.equal(await s.command('simple.create', { name: 'Conta', value: 10 }), true);
  assert.equal(s.snapshot.ready, false); assert.equal(await s.command('simple.create'), false);
  assert.ok(s.snapshot.error);
});

test('client/API projection with isolated SQL: CRUD, recurring, cards, partial chain, installments, closure, history and categories', async t => {
  const pg = new PGlite(); t.after(() => pg.close());
  await pg.exec(readFileSync(new URL('../database/migrations/001_finance_v2.sql', import.meta.url), 'utf8'));
  const transport: Transport = { batch: (queries, ro) => pg.transaction(async tx => {
    if (ro) await tx.exec('SET TRANSACTION READ ONLY'); const results = [];
    for (const query of queries) results.push((await tx.query(query.text, query.values)).rows); return results;
  }) };
  const foundation = createFoundation({ transaction: (qs, ro = false) => transport.batch(qs, ro) }); await foundation.initialize();
  const service = createFinanceService(createRepository(transport));
  const api = createFinanceApi((async (url, init) => {
    const path = new URL(String(url), 'http://localhost'); const data = init?.body ? JSON.parse(String(init.body)) : {};
    if (path.pathname === '/api/finance/commands') return response(await service.execute(data));
    if (path.pathname.startsWith('/api/categories')) {
      const id = path.pathname.split('/')[3];
      return response(init?.method === 'POST' ? await foundation.createCategory(data) : init?.method === 'PATCH' ? await foundation.editCategory(id, data) : await foundation.archiveCategory(id));
    }
    return response(await service.read(path.searchParams.get('month')));
  }) as typeof fetch);
  const s = new FinanceSession('2026-08', api); await s.load();
  const state = () => s.snapshot.view!.state;
  const run = async (action: string, data: object = {}) => assert.equal(await s.command(action, data), true, action + ': ' + s.snapshot.error);
  assert.equal(state().simpleAccounts.length, 0); assert.deepEqual(state().categories.map(c => c.name), ['Casa', 'Mercado', 'Manoela', 'Antônio', 'Lazer', 'Saúde', 'Transporte']);
  await run('simple.create', { name: 'Conta', value: 10 }); const id = state().simpleAccounts[0].id;
  await run('simple.edit', { id, name: 'Conta editada', value: 20 }); await run('payment', { id, type: 'simple', status: 'pago' });
  await run('month.close'); assert.ok(state().closedMonths?.['2026-08']);
  await run('month.reopen'); assert.ok(state().closedMonthHistory?.['2026-08']?.length);
  await run('recurring.create', { name: 'Fixa', initialValue: 12 });
  await run('card.create', { name: 'Cartão' }); const cardId = state().creditCards[0].id;
  await run('expense.create', { cardId, description: 'Agosto', amount: 1000 });
  await run('payment', { id: cardId, type: 'credit_card', status: 'parcial', amount: 900 });
  await s.load('2026-09'); await run('expense.create', { cardId, description: 'Setembro', amount: 1900 });
  await run('payment', { id: cardId, type: 'credit_card', status: 'parcial', amount: 1500 });
  await s.load('2026-10'); let card = computeMonthlyAccounts('2026-10', state()).find(a => a.type === 'credit_card')!;
  assert.equal(card.amount, 500); await run('payment', { id: cardId, type: 'credit_card', status: 'pago' });
  await s.load('2026-11'); card = computeMonthlyAccounts('2026-11', state()).find(a => a.type === 'credit_card')!;
  assert.equal(card.amount, 0);
  await run('installment.create', { description: 'Parcelas', totalAmount: 100, installmentsCount: 3 });
  assert.equal(state().installmentPurchases[0].versions?.length, 1);
  assert.equal(await s.category('POST', undefined, { name: 'Teste isolado', color: '#123456' }), true);
  const category = state().categories.find(c => c.name === 'Teste isolado')!;
  await s.category('PATCH', category.id, { name: 'Editada', color: '#654321' }); await s.category('DELETE', category.id);
  assert.equal(state().categories.length, 7); assert.equal(s.snapshot.month, '2026-11');
});

test('same-origin local browser allowed; remote, cross-site, forwarded and Production remain blocked', t => {
  const keys = ['VERCEL', 'NODE_ENV', 'CONTAS_TATU_ENABLE_LOCAL_API']; const saved = keys.map(k => [k, process.env[k]]);
  t.after(() => { for (const [k, v] of saved) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
  delete process.env.VERCEL; process.env.NODE_ENV = 'test'; process.env.CONTAS_TATU_ENABLE_LOCAL_API = 'true';
  const req = { socket: { remoteAddress: '127.0.0.1' }, headers: { host: '127.0.0.1:3100', origin: 'http://127.0.0.1:3100', 'sec-fetch-site': 'same-origin' } } as any;
  assert.equal(localAccess(req), true);
  for (const headers of [{ origin: 'http://127.0.0.1:9999' }, { origin: 'null' }, { 'sec-fetch-site': 'cross-site' }, { forwarded: 'for=127.0.0.1' }, { 'x-forwarded-for': '127.0.0.1' }]) assert.equal(localAccess({ ...req, headers: { ...req.headers, ...headers } }), false);
  process.env.VERCEL = '1'; assert.equal(localAccess(req), false); delete process.env.VERCEL;
  process.env.NODE_ENV = 'production'; assert.equal(localAccess(req), false);
});
