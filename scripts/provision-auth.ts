import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { getNeonClient } from '../server/neon.js';
import { neonTransport } from '../server/finance/repository.js';
import { provisionUsers } from '../server/auth/provision.js';
import { DEFAULT_HOUSEHOLD_ID } from '../server/foundation.js';
try {
  const env = parseEnv(await readFile('.env.local','utf8'));
  if (!env.CONTAS_TATU_DATABASE_URL) throw new Error();
  process.env.CONTAS_TATU_DATABASE_URL=env.CONTAS_TATU_DATABASE_URL;
  const url = new URL(env.CONTAS_TATU_DATABASE_URL);
  if (url.hostname !== 'ep-mute-flower-b7tq5afc-pooler.c-13.us-east-1.aws.neon.tech' || url.pathname !== '/neondb') throw new Error();
  const sql = getNeonClient();
  const rows = await sql.query('SELECT id,name FROM finance_v2.households WHERE id=$1',[DEFAULT_HOUSEHOLD_ID]);
  if (rows.length!==1 || rows[0].name!=='Contas Tatu') throw new Error();
  const existing = await sql.query("SELECT tablename FROM pg_tables WHERE schemaname='finance_v2' AND tablename LIKE 'auth_%'");
  if (existing.length) throw new Error();
  console.log('Target verified. Waiting for initial password on standard input (never logged).');
  if (!process.stdin.isTTY) throw new Error('Interactive protected input required');
  process.stdin.setRawMode(true); process.stdin.resume();
  const password = await new Promise<string>(resolve => {
    let value='';
    const receive = (data: Buffer) => {
      value+=data.toString();
      if (/[\r\n]/.test(value)) { process.stdin.off('data',receive); resolve(value.split(/[\r\n]/)[0]); }
    };
    process.stdin.on('data',receive);
  });
  process.stdin.setRawMode(false); process.stdin.pause();
  const migration = await readFile('database/migrations/002_closed_auth.sql','utf8');
  // Neon HTTP transaction wraps the entire DDL atomically; remove only explicit transaction markers.
  const statements = migration.replace(/^--.*$/gm,'').split(';').map(s=>s.trim()).filter(s=>s && !['BEGIN','COMMIT'].includes(s));
  await sql.transaction(statements.map(text=>sql.query(text)));
  await provisionUsers(neonTransport,password);
  console.log('Auth migration and closed users provisioned. Password omitted.');
  console.log(await sql.query(`SELECT c.login,u.display_name,m.household_id,
    (c.password_hash LIKE '$2b$12$%') AS secure_hash FROM finance_v2.auth_credentials c
    JOIN finance_v2.app_users u ON u.id=c.user_id JOIN finance_v2.household_memberships m ON m.user_id=c.user_id WHERE m.household_id=$1`,[DEFAULT_HOUSEHOLD_ID]));
} catch { console.error('Auth provisioning stopped. No details or credentials exposed. Verify migration status before retry.'); process.exitCode=1; }
