import { createServer as httpServer, type IncomingMessage } from 'node:http';
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { createServer as viteServer } from 'vite';
import { createFoundation } from '../server/foundation.js';
import { createRepository, type Transport } from '../server/finance/repository.js';
import { createFinanceService } from '../server/finance/service.js';
import { financeHandler } from '../server/finance/api.js';
import { categoryHandler } from '../server/category-api.js';

async function main() {
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') throw new Error('Local development only');
  const isolated = process.argv.includes('--isolated');
  // Never select a database silently. Isolated mode never reads environment files.
  if (!isolated && !process.argv.includes('--neon')) throw new Error('Select --isolated or --neon');
  process.env.CONTAS_TATU_ENABLE_LOCAL_API = 'true';
  process.env.VITE_FINANCE_MODE = 'neon';
  let transport: Transport | undefined;
  let closeDatabase = async () => {};
  if (isolated) {
    const { PGlite } = await import('@electric-sql/pglite');
    const pg = new PGlite();
    await pg.exec(await readFile(new URL('../database/migrations/001_finance_v2.sql', import.meta.url), 'utf8'));
    transport = { batch: (queries, readOnly) => pg.transaction(async tx => {
      if (readOnly) await tx.exec('SET TRANSACTION READ ONLY');
      const results = [];
      for (const query of queries) results.push((await tx.query<Record<string, unknown>>(query.text, query.values)).rows);
      return results;
    }) };
    closeDatabase = () => pg.close();
  } else {
    const env = parseEnv(await readFile(new URL('../.env.local', import.meta.url), 'utf8'));
    if (!env.CONTAS_TATU_DATABASE_URL) throw new Error('Missing local configuration');
    process.env.CONTAS_TATU_DATABASE_URL = env.CONTAS_TATU_DATABASE_URL;
  }
  const foundation = createFoundation(transport ? { transaction: (qs, ro = false) => transport!.batch(qs, ro) } : undefined);
  if (isolated) await foundation.initialize();
  const finance = createFinanceService(createRepository(transport));
  const read = financeHandler(false, finance), write = financeHandler(true, finance);
  const categories = categoryHandler(false, foundation), category = categoryHandler(true, foundation);
  const vite = await viteServer({ envDir: false, server: { middlewareMode: true }, appType: 'spa' });
  const server = httpServer(async (req, res) => {
    try {
      if (isolated) res.setHeader('X-Contas-Tatu-Isolated', 'true');
      const url = new URL(req.url ?? '/', 'http://localhost');
      const request = req as IncomingMessage & { query: Record<string, string | string[]> };
      request.query = {};
      for (const key of url.searchParams.keys()) { const values = url.searchParams.getAll(key); request.query[key] = values.length === 1 ? values[0] : values; }
      if (url.pathname === '/api/finance') return await read(request, res);
      if (url.pathname === '/api/finance/commands') return await write(request, res);
      if (url.pathname === '/api/categories' || url.pathname === '/api/categories/') return await categories(request, res);
      const item = /^\/api\/categories\/([0-9a-f-]+)$/i.exec(url.pathname);
      if (item) { request.query.id = item[1]; return await category(request, res); }
      if (url.pathname.startsWith('/api/')) { res.writeHead(404); res.end(); return; }
      vite.middlewares(req, res);
    } catch { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end('{"error":"Local request failed"}'); }
  });
  const port = Number(process.env.CONTAS_TATU_LOCAL_PORT ?? 3100);
  server.listen(port, '127.0.0.1', () => console.log(`Controlled ${isolated ? 'isolated PGlite' : 'Neon'} app: http://127.0.0.1:${port}`));
  const shutdown = async () => { server.close(); await vite.close(); await closeDatabase(); process.exit(0); };
  process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
}
main().catch(() => { console.error('Unable to start controlled environment. Check mode and local configuration.'); process.exitCode = 1; });
