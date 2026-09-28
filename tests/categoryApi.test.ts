import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { categoryHandler } from '../server/category-api.js';
import { createFoundation, FoundationError } from '../server/foundation.js';

test('category API controlled access, methods, CRUD responses and error sanitization', async (t) => {
  const keys = ['VERCEL', 'NODE_ENV', 'CONTAS_TATU_ENABLE_LOCAL_API'];
  const saved = keys.map(k => [k, process.env[k]] as const);
  t.after(() => { for (const [k, v] of saved) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
  delete process.env.VERCEL; process.env.NODE_ENV = 'test'; process.env.CONTAS_TATU_ENABLE_LOCAL_API = 'true';
  let calls = 0; let failure: Error | undefined;
  const c = { id: 'ad72e2a0-2643-4c2b-9c31-e15d77103201', name: 'Casa', color: '#2563eb' };
  const act = async () => { calls++; if (failure) throw failure; return c; };
  const service = {
    listCategories: async () => [await act()], createCategory: act, editCategory: act,
    archiveCategory: async () => { await act(); return { id: c.id, archived: true }; },
  } as unknown as ReturnType<typeof createFoundation>;
  async function invoke(method: string, item = false, overrides: Record<string, unknown> = {}) {
    let body = ''; const headers: Record<string, string> = {};
    const response = { statusCode: 0, setHeader(k: string, v: string) { headers[k] = v; }, end(v = '') { body = v; } };
    const request = { method, socket: { remoteAddress: '127.0.0.1' }, headers: { host: 'localhost:3000', 'content-type': 'application/json' },
      query: item ? { id: c.id } : {}, body: { name: 'Casa', color: '#2563eb' }, ...overrides };
    await categoryHandler(item, service)(request as unknown as IncomingMessage, response as unknown as ServerResponse);
    return { status: response.statusCode, body, headers };
  }
  assert.equal((await invoke('GET')).status, 200);
  assert.equal((await invoke('POST')).status, 201);
  assert.equal((await invoke('PATCH', true)).status, 200);
  assert.deepEqual(JSON.parse((await invoke('DELETE', true)).body), { id: c.id, archived: true });
  const before = calls;
  assert.equal((await invoke('DELETE')).status, 405);
  assert.equal((await invoke('GET', true)).headers.Allow, 'PATCH, DELETE');
  assert.equal((await invoke('HEAD')).body, '');
  assert.equal((await invoke('GET', false, { query: { household: 'other' } })).status, 400);
  assert.equal((await invoke('POST', false, { body: '{' })).status, 400);
  assert.equal((await invoke('POST', false, { body: 'x'.repeat(9000) })).status, 413);
  assert.equal((await invoke('POST', false, { headers: { host: 'localhost', 'content-type': 'text/plain' } })).status, 415);
  assert.equal((await invoke('GET', false, { socket: { remoteAddress: '203.0.113.1' } })).status, 403);
  assert.equal((await invoke('GET', false, { headers: { host: 'attacker.example' } })).status, 403);
  assert.equal((await invoke('GET', false, { headers: { host: 'localhost', origin: 'https://example.com' } })).status, 403);
  process.env.VERCEL = '1'; assert.equal((await invoke('GET')).status, 403); delete process.env.VERCEL;
  process.env.NODE_ENV = 'production'; assert.equal((await invoke('GET')).status, 403); process.env.NODE_ENV = 'test';
  delete process.env.CONTAS_TATU_ENABLE_LOCAL_API; assert.equal((await invoke('GET')).status, 403);
  process.env.CONTAS_TATU_ENABLE_LOCAL_API = 'true';
  assert.equal(calls, before);
  failure = new Error('secret password connection host SQL stack');
  const error = await invoke('GET');
  assert.equal(error.status, 500);
  assert.deepEqual(JSON.parse(error.body), { error: 'Unable to process category request' });
  failure = new FoundationError(404, 'Category not found');
  assert.equal((await invoke('DELETE', true)).status, 404);
});
