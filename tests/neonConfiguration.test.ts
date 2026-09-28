import assert from 'node:assert/strict';
import { test } from 'node:test';

test('Neon configuration is lazy, exclusive, reusable and does not make requests', async (t) => {
  const keys = ['CONTAS_TATU_DATABASE_URL', 'DATABASE_URL', 'NEON_READONLY_DATABASE_URL'] as const;
  const saved = keys.map((key) => [key, process.env[key]] as const);
  t.after(() => {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  let requests = 0;
  t.mock.method(globalThis, 'fetch', () => {
    requests++;
    throw new Error('Network requests are forbidden in configuration tests');
  });

  delete process.env.CONTAS_TATU_DATABASE_URL;
  // Synthetic values only; no env files or production credentials are loaded.
  process.env.DATABASE_URL = 'postgresql://legacy:unused@legacy.invalid/old';
  process.env.NEON_READONLY_DATABASE_URL = 'postgresql://legacy:unused@readonly.invalid/old';
  const { getNeonClient } = await import('../server/neon.js');

  await t.test('legacy variables do not satisfy missing configuration', () => {
    assert.throws(getNeonClient, {
      message: 'CONTAS_TATU_DATABASE_URL must be configured on the server',
    });
    process.env.CONTAS_TATU_DATABASE_URL = '  ';
    assert.throws(getNeonClient, /must be configured on the server/);
  });

  await t.test('invalid configuration produces a sanitized error without a cause', () => {
    for (const value of ['invalid-sensitive-value', 'https://synthetic:unused@example.invalid/db']) {
      process.env.CONTAS_TATU_DATABASE_URL = value;
      assert.throws(getNeonClient, (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, 'CONTAS_TATU_DATABASE_URL must be a valid PostgreSQL connection URL');
        assert.equal(error.cause, undefined);
        assert.ok(!error.stack?.includes(value));
        return true;
      });
    }
  });

  await t.test('client is reused and refreshed only for the dedicated configuration', () => {
    process.env.CONTAS_TATU_DATABASE_URL = 'postgresql://test:unused@database.invalid/contas_tatu';
    const client = getNeonClient();
    assert.equal(typeof client, 'function');
    assert.equal(getNeonClient(), client);
    process.env.DATABASE_URL = 'ignored';
    process.env.NEON_READONLY_DATABASE_URL = 'ignored';
    assert.equal(getNeonClient(), client);
    process.env.CONTAS_TATU_DATABASE_URL = 'postgresql://test:unused@other.invalid/contas_tatu';
    assert.notEqual(getNeonClient(), client);
    delete process.env.CONTAS_TATU_DATABASE_URL;
    assert.throws(getNeonClient, /must be configured on the server/);
  });
  assert.equal(requests, 0);
});
