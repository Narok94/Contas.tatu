import type { IncomingMessage, ServerResponse } from 'node:http';
import { getNeonClient } from '../server/neon.js';

export default async function dbHealth(request: IncomingMessage, response: ServerResponse) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('X-Content-Type-Options', 'nosniff');

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    response.statusCode = 405;
    response.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const sql = getNeonClient();
    const [rows] = await sql.transaction([
      sql`SELECT current_database() AS database,
        EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'finance_v2') AS schema_exists,
        (SELECT count(*)::int FROM pg_catalog.pg_class c
          JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'finance_v2' AND c.relkind IN ('r', 'p', 'f')) AS tables`,
    ], { readOnly: true, fetchOptions: { signal: AbortSignal.timeout(10_000) } });

    const result = rows[0];
    if (result?.database !== 'neondb' || result.schema_exists !== true || result.tables !== 21) {
      throw new Error('Unexpected database structure');
    }
    response.statusCode = 200;
    response.end(request.method === 'HEAD' ? undefined : JSON.stringify({
      status: 'ok', database: 'neondb', schema: 'finance_v2', tables: 21,
    }));
  } catch {
    response.statusCode = 500;
    response.end(request.method === 'HEAD' ? undefined : JSON.stringify({ error: 'Database health check failed' }));
  }
}
