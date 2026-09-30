import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { neon } from '@neondatabase/serverless';
for (const file of ['.env.local', '.env.vercel.production.local']) {
  const env = parseEnv(await readFile(file, 'utf8'));
  const url = env.CONTAS_TATU_DATABASE_URL || env.DATABASE_URL;
  if (!url) continue;
  const sql = neon(url);
  try {
    console.log(file, await sql.query("SELECT current_database() AS database, to_regclass('finance_v2.households')::text AS households, to_regclass('finance_v2.app_users')::text AS users"));
    console.log('Known household', await sql.query('SELECT id,name FROM finance_v2.households WHERE id=$1', ['ad72e2a0-2643-4c2b-9c31-e15d77103101']));
    console.log('Existing identities', await sql.query('SELECT id,auth_issuer,auth_subject FROM finance_v2.app_users'));
    console.log('Auth structures', await sql.query("SELECT tablename FROM pg_tables WHERE schemaname='finance_v2' AND tablename LIKE 'auth_%'"));
  } catch { console.log(file, 'Metadata unavailable'); }
}
