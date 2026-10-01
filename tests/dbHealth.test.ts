import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { IncomingMessage, ServerResponse } from 'node:http';
import dbHealth from '../api/db-health.js';
import { getNeonClient } from '../server/neon.js';

test('database health endpoint uses read-only metadata and sanitized responses', async (t) => {
  const saved = process.env.CONTAS_TATU_DATABASE_URL;
  t.after(() => {
    if (saved === undefined) delete process.env.CONTAS_TATU_DATABASE_URL;
    else process.env.CONTAS_TATU_DATABASE_URL = saved;
  });
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Real network forbidden'); });
  process.env.CONTAS_TATU_DATABASE_URL = 'postgresql://test:synthetic@health.invalid/test';
  const client = getNeonClient();
  const good = { database: 'neondb', schema_exists: true, tables: 22 };
  let row = good;
  let failure = false;
  let calls = 0;
  t.mock.method(client, 'transaction', async (_queries: unknown, options: { readOnly: boolean }) => {
    calls++;
    assert.equal(options.readOnly, true);
    if (failure) throw new Error('synthetic-secret password host SQL stack');
    return [[row]];
  });
  async function invoke(method: string) {
    const headers: Record<string, string> = {};
    let body: string | undefined;
    const response = {
      statusCode: 0,
      setHeader(name: string, value: string) { headers[name] = value; },
      end(value?: string) { body = value; },
    };
    await dbHealth({ method } as IncomingMessage, response as unknown as ServerResponse);
    return { status: response.statusCode, headers, body };
  }
  await t.test('GET returns only the expected public metadata', async () => {
    const r = await invoke('GET');
    assert.equal(r.status, 200);
    assert.deepEqual(JSON.parse(r.body!), { status: 'ok', database: 'neondb', schema: 'finance_v2', tables: 22 });
    assert.equal(r.headers['Cache-Control'], 'no-store');
  });
  await t.test('HEAD verifies the database with no body', async () => {
    const before = calls;
    const r = await invoke('HEAD');
    assert.equal(r.status, 200);
    assert.equal(r.body, undefined);
    assert.equal(calls, before + 1);
  });
  await t.test('other methods return 405 without accessing the database', async () => {
    const before = calls;
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
      const r = await invoke(method);
      assert.equal(r.status, 405);
      assert.equal(r.headers.Allow, 'GET, HEAD');
      assert.deepEqual(JSON.parse(r.body!), { error: 'Method not allowed' });
    }
    assert.equal(calls, before);
  });
  await t.test('connection errors are generic and HEAD errors have no body', async () => {
    failure = true;
    const r = await invoke('GET');
    assert.equal(r.status, 500);
    assert.deepEqual(JSON.parse(r.body!), { error: 'Database health check failed' });
    const head = await invoke('HEAD');
    assert.equal(head.status, 500);
    assert.equal(head.body, undefined);
    failure = false;
  });
  await t.test('unexpected schema, count or database fails closed', async () => {
    for (const invalid of [{ ...good, schema_exists: false }, { ...good, tables: 17 }, { ...good, database: 'unexpected' }]) {
      row = invalid;
      const r = await invoke('GET');
      assert.equal(r.status, 500);
      assert.deepEqual(JSON.parse(r.body!), { error: 'Database health check failed' });
    }
    row = good;
  });
  await t.test('missing configuration returns a generic error without querying', async () => {
    delete process.env.CONTAS_TATU_DATABASE_URL;
    const before = calls;
    const r = await invoke('GET');
    assert.equal(r.status, 500);
    assert.deepEqual(JSON.parse(r.body!), { error: 'Database health check failed' });
    assert.equal(calls, before);
  });
});
