import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { financeHandler } from '../server/finance/api.js';
import { FoundationError } from '../server/foundation.js';
import { createFinanceService } from '../server/finance/service.js';

test('financial HTTP API: methods, local-only boundary, safe failures and strict scope', async t => {
  const keys = ['VERCEL', 'NODE_ENV', 'CONTAS_TATU_ENABLE_LOCAL_API'];
  const saved = keys.map(k => [k, process.env[k]] as const);
  t.after(() => { for (const [k,v] of saved) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
  delete process.env.VERCEL; process.env.NODE_ENV = 'test'; process.env.CONTAS_TATU_ENABLE_LOCAL_API = 'true';
  let reads = 0, writes = 0; let failure: Error | undefined;
  const service = {
    read: async () => { reads++; if (failure) throw failure; return { revision: '1', accounts: [], summary: { totalPaid: 0 } }; },
    execute: async () => { writes++; if (failure) throw failure; return { status: 'ok', revision: '2' }; },
    payoffQuote: async () => ({ revision: '1', amount: 100 }),
  } as unknown as ReturnType<typeof createFinanceService>;
  const invoke = async (commands: boolean, method: string, overrides: object = {}) => {
    let body = ''; const headers: Record<string,string> = {};
    const response = { statusCode: 0, setHeader(k: string,v: string) { headers[k]=v; }, end(v='') { body=v; } };
    const request = { method, headers: { host: 'localhost:3000', 'content-type': 'application/json' }, socket: { remoteAddress: '127.0.0.1' },
      query: commands ? {} : { month: '2026-09' }, body: { action: 'month.close', month: '2026-09', expectedRevision: '1' }, ...overrides };
    await financeHandler(commands, service)(request as unknown as IncomingMessage, response as unknown as ServerResponse);
    return { status: response.statusCode, body, headers };
  };
  await t.test('GET and HEAD read state; POST dispatches command; payoff reads do not write', async () => {
    assert.equal((await invoke(false,'GET')).status,200);
    const head = await invoke(false,'HEAD'); assert.equal(head.status,200); assert.equal(head.body,'');
    assert.equal((await invoke(true,'POST')).status,200);
    assert.equal((await invoke(false,'GET',{query:{month:'2026-09',payoffId:'id'}})).status,200);
    assert.equal(reads,2); assert.equal(writes,1);
  });
  await t.test('disallowed methods do not reach the service', async () => {
    const r = reads, w = writes;
    assert.equal((await invoke(false,'POST')).headers.Allow,'GET, HEAD');
    assert.equal((await invoke(true,'GET')).headers.Allow,'POST');
    assert.equal((await invoke(true,'DELETE')).status,405);
    assert.equal(reads,r); assert.equal(writes,w);
  });
  await t.test('all remote and production requests fail closed without any service calls', async () => {
    const r=reads,w=writes;
    for (const overrides of [
      {socket:{remoteAddress:'203.0.113.1'}}, {headers:{host:'remote.example'}},
      {headers:{host:'localhost',origin:'https://remote.example'}}, {headers:{host:'localhost','x-forwarded-for':'127.0.0.1'}},
    ]) assert.equal((await invoke(true,'POST',overrides)).status,403);
    process.env.VERCEL='1'; assert.equal((await invoke(true,'POST')).status,403); delete process.env.VERCEL;
    process.env.NODE_ENV='production'; assert.equal((await invoke(true,'POST')).status,403); process.env.NODE_ENV='test';
    delete process.env.CONTAS_TATU_ENABLE_LOCAL_API; assert.equal((await invoke(false,'GET')).status,403);
    process.env.CONTAS_TATU_ENABLE_LOCAL_API='true'; assert.equal(reads,r); assert.equal(writes,w);
  });
  await t.test('malformed bodies and query household selection are rejected', async () => {
    assert.equal((await invoke(true,'POST',{body:'{'})).status,400);
    assert.equal((await invoke(true,'POST',{body:'x'.repeat(9000)})).status,413);
    assert.equal((await invoke(true,'POST',{headers:{host:'localhost','content-type':'text/plain'}})).status,415);
    assert.equal((await invoke(false,'GET',{query:{month:'2026-09',household:'other'}})).status,400);
  });
  await t.test('connection/config errors never expose raw message, stack or credentials', async () => {
    failure = new Error('synthetic password connectionString host SQL stack');
    for (const [commands,method] of [[false,'GET'],[true,'POST']] as const) {
      const r=await invoke(commands,method); assert.equal(r.status,500);
      assert.deepEqual(JSON.parse(r.body),{error:'Unable to process financial request'});
    }
    const head=await invoke(false,'HEAD'); assert.equal(head.status,500); assert.equal(head.body,'');
    failure=new FoundationError(409,'State changed; reload before retrying');
    assert.equal((await invoke(true,'POST')).status,409);
  });
});
