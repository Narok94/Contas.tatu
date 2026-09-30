import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { DEFAULT_HOUSEHOLD_ID, FoundationError } from '../foundation.js';
import { neonTransport, q, type Transport } from '../finance/repository.js';

export interface Identity { id: string; name: string; householdId: string }
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const temporaryDigest = (token: string, key: string) => digest(`temporary:${token}:${key}`);
// Constant-cost dummy verification for unknown logins; no initial password is embedded.
const dummyHash = bcrypt.hash('unavailable-' + randomBytes(32).toString('hex'), 12);
const invalid = () => new FoundationError(401, 'Usuário ou senha incorretos.');
export function createAuthService(db: Transport = neonTransport) {
  async function lookup(token: string, navigationKey?: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return undefined;
    const [rows] = await db.batch([q(`SELECT u.id,u.display_name AS name,m.household_id AS "householdId",
      s.persistent,s.absolute_expires_at,s.renewed_at,s.expires_at
      FROM finance_v2.auth_sessions s JOIN finance_v2.auth_credentials c ON c.user_id=s.user_id
      JOIN finance_v2.app_users u ON u.id=s.user_id
      JOIN finance_v2.household_memberships m ON m.user_id=u.id AND m.household_id=$2
      WHERE ((s.persistent AND s.token_hash=$1) OR (NOT s.persistent AND s.token_hash=$3))
      AND c.enabled AND s.password_version=c.password_version
      AND s.expires_at>CURRENT_TIMESTAMP AND s.absolute_expires_at>CURRENT_TIMESTAMP
      AND c.login IN ('henrique','jessica') AND m.role IN ('owner','editor')`, [digest(token), DEFAULT_HOUSEHOLD_ID,
        navigationKey && /^[0-9a-f]{64}$/.test(navigationKey) ? temporaryDigest(token,navigationKey) : null])], true);
    return rows[0];
  }
  return {
    async login(value: unknown, address: string, previous?: string) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
      const v = value as Record<string, unknown>;
      if (Object.keys(v).some(k => !['login','password','remember','navigationKey'].includes(k)) || typeof v.login !== 'string' ||
        typeof v.password !== 'string' || v.login.length > 80 || Buffer.byteLength(v.password) > 72 ||
        (v.remember !== undefined && typeof v.remember !== 'boolean')) throw invalid();
      if (v.remember !== true && (typeof v.navigationKey !== 'string' || !/^[0-9a-f]{64}$/.test(v.navigationKey))) throw invalid();
      const login = v.login.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
      const limits = [digest('ip:' + address), digest('login:' + login)];
      const counted = await db.batch(limits.map(key => q(`INSERT INTO finance_v2.auth_login_limits(key_hash) VALUES ($1)
        ON CONFLICT(key_hash) DO UPDATE SET attempts=CASE WHEN auth_login_limits.window_start < CURRENT_TIMESTAMP-INTERVAL '15 minutes' THEN 1 ELSE auth_login_limits.attempts+1 END,
        window_start=CASE WHEN auth_login_limits.window_start < CURRENT_TIMESTAMP-INTERVAL '15 minutes' THEN CURRENT_TIMESTAMP ELSE auth_login_limits.window_start END RETURNING attempts`, [key])), false);
      if (counted.some(r => Number(r[0].attempts) > 10)) throw new FoundationError(429, 'Muitas tentativas. Aguarde alguns minutos e tente novamente.');
      const [users] = await db.batch([q(`SELECT c.user_id AS id,c.password_hash,c.password_version,u.display_name AS name
        FROM finance_v2.auth_credentials c JOIN finance_v2.app_users u ON u.id=c.user_id
        JOIN finance_v2.household_memberships m ON m.user_id=c.user_id AND m.household_id=$2
        WHERE c.login=$1 AND c.enabled AND m.role IN ('owner','editor')`, [login, DEFAULT_HOUSEHOLD_ID])], true);
      const user = users[0];
      const matches = await bcrypt.compare(v.password, user?.password_hash as string ?? await dummyHash);
      if (!user || !matches) throw invalid();
      const token = randomBytes(32).toString('base64url');
      const persistent = v.remember === true;
      const age = persistent ? 30 * 86400 : 8 * 3600;
      const writes = [q(`INSERT INTO finance_v2.auth_sessions(token_hash,user_id,password_version,persistent,expires_at,absolute_expires_at)
        VALUES($1,$2,$3,$4,CURRENT_TIMESTAMP+$5::integer*INTERVAL '1 second',CURRENT_TIMESTAMP+$6::integer*INTERVAL '1 second')`,
        [persistent ? digest(token) : temporaryDigest(token,v.navigationKey as string), user.id, user.password_version, persistent, age, persistent ? 90*86400 : age])];
      if (previous && /^[A-Za-z0-9_-]{43}$/.test(previous)) writes.push(q('DELETE FROM finance_v2.auth_sessions WHERE token_hash=$1',[digest(previous)]));
      // Expired auth records only; no financial or legacy data is touched.
      writes.push(q('DELETE FROM finance_v2.auth_sessions WHERE expires_at<CURRENT_TIMESTAMP'));
      writes.push(q("DELETE FROM finance_v2.auth_login_limits WHERE window_start<CURRENT_TIMESTAMP-INTERVAL '1 day'"));
      await db.batch(writes, false);
      return { token, age: persistent ? age : undefined, user: { id: String(user.id), name: String(user.name), householdId: DEFAULT_HOUSEHOLD_ID } };
    },
    async session(token: string, renew = false, navigationKey?: string) {
      const row = await lookup(token,navigationKey);
      if (!row) return undefined;
      const user: Identity = { id: String(row.id), name: String(row.name), householdId: String(row.householdId) };
      // Renew the server expiry with the same opaque login token. Logout can always revoke it,
      // even when another tab has an outstanding renewal response. Absolute lifetime never grows.
      if (renew && row.persistent && Date.now()-new Date(String(row.renewed_at)).getTime() > 86400_000) {
        const [changed] = await db.batch([q(`UPDATE finance_v2.auth_sessions SET renewed_at=CURRENT_TIMESTAMP,
          expires_at=LEAST(absolute_expires_at,CURRENT_TIMESTAMP+INTERVAL '30 days')
          WHERE token_hash=$1 AND expires_at>CURRENT_TIMESTAMP RETURNING EXTRACT(EPOCH FROM expires_at-CURRENT_TIMESTAMP)::integer AS age`, [digest(token)])], false);
        if (changed.length) return { user, token, age: Number(changed[0].age) };
        return undefined;
      }
      return { user };
    },
    async logout(token: string, navigationKey?: string) {
      await db.batch([q('DELETE FROM finance_v2.auth_sessions WHERE token_hash=$1 OR token_hash=$2',
        [digest(token), navigationKey && /^[0-9a-f]{64}$/.test(navigationKey) ? temporaryDigest(token,navigationKey) : null])], false);
    },
  };
}
