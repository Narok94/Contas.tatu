import bcrypt from 'bcryptjs';
import { DEFAULT_HOUSEHOLD_ID } from '../foundation.js';
import { q, type Transport } from '../finance/repository.js';
export const CLOSED_USERS = [
  { id:'ad72e2a0-2643-4c2b-9c31-e15d77103103', login:'henrique', name:'Henrique' },
  { id:'ad72e2a0-2643-4c2b-9c31-e15d77103104', login:'jessica', name:'Jéssica' },
];
// Administrative provisioning only. Never called by an HTTP endpoint.
export async function provisionUsers(db: Transport, password: string) {
  if (!password || Buffer.byteLength(password)>72) throw new Error('Invalid initial password');
  const hashes = await Promise.all(CLOSED_USERS.map(() => bcrypt.hash(password,12)));
  const statements = [q('SELECT pg_advisory_xact_lock(721904,2)'),
    q('SELECT 1 / CASE WHEN EXISTS(SELECT 1 FROM finance_v2.households WHERE id=$1) THEN 1 ELSE 0 END',[DEFAULT_HOUSEHOLD_ID])];
  for (const [i,u] of CLOSED_USERS.entries()) {
    statements.push(q(`INSERT INTO finance_v2.app_users(id,auth_issuer,auth_subject,display_name)
      VALUES($1,'contas-tatu:password',$2,$3) ON CONFLICT(id) DO NOTHING`,[u.id,u.login,u.name]));
    statements.push(q(`INSERT INTO finance_v2.household_memberships(household_id,user_id,role)
      VALUES($1,$2,'owner') ON CONFLICT(household_id,user_id) DO NOTHING`,[DEFAULT_HOUSEHOLD_ID,u.id]));
    statements.push(q(`INSERT INTO finance_v2.auth_credentials(user_id,login,password_hash)
      VALUES($1,$2,$3) ON CONFLICT(user_id) DO NOTHING`,[u.id,u.login,hashes[i]]));
  }
  await db.batch(statements,false);
}
