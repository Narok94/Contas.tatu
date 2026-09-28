import { randomUUID } from 'node:crypto';
import { getNeonClient } from '../neon.js';
import { DEFAULT_HOUSEHOLD_ID as household, FoundationError } from '../foundation.js';
import type { FinanceDataStore } from '../../src/domain/financeRules.js';
import { mappings, decodeState, encode, encodeVersion, type SqlRow } from './mapping.js';

export interface Query { text: string; values: unknown[] }
export interface Transport { batch(queries: Query[], readOnly: boolean): Promise<SqlRow[][]> }
export const neonTransport: Transport = {
  async batch(queries, readOnly) {
    const sql = getNeonClient();
    return sql.transaction(queries.map(q => sql.query(q.text, q.values)), { readOnly, fetchOptions: { signal: AbortSignal.timeout(20_000) } });
  },
};
export const q = (text: string, values: unknown[] = []): Query => ({ text, values });
const tableOrders: Record<string, string> = {
  categories: 'sort_order,id', ...Object.fromEntries(Object.values(mappings).map(([t]) => [t, 'sort_order,id'])),
  installment_versions: 'purchase_id,revision', installment_month_states: 'purchase_id,month',
  installment_month_snapshots: 'purchase_id,month', financial_months: 'month',
  month_closures: 'month,revision', month_reopenings: 'month,recorded_at,closure_id',
};
export interface Loaded { revision: string; store: FinanceDataStore; tables: Record<string, SqlRow[]> }
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function insert(table: string, row: SqlRow, conflict?: string[]): Query {
  const data = { household_id: household, ...row };
  const columns = Object.keys(data);
  const updates = columns.filter(c => c !== 'household_id' && !conflict?.includes(c) && c !== 'created_at');
  return q(`INSERT INTO finance_v2.${table} (${columns.join(',')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(',')})${conflict ?
    ` ON CONFLICT (household_id,${conflict.join(',')}) DO UPDATE SET ${updates.map(c => `${c}=EXCLUDED.${c}`).join(',')},updated_at=CURRENT_TIMESTAMP` : ''}`, Object.values(data));
}
export function createRepository(transport: Transport = neonTransport) {
  return {
    async load(): Promise<Loaded> {
      // One SELECT: household revision and every table share exactly one MVCC snapshot.
      const parts = Object.entries(tableOrders).map(([table, order]) => `'${table}',(SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY ${order}), '[]'::jsonb) FROM finance_v2.${table} r WHERE household_id=$1)`);
      const [rows] = await transport.batch([q(`SELECT revision::text, jsonb_build_object(${parts.join(',')}) AS tables FROM finance_v2.households WHERE id=$1`, [household])], true);
      if (!rows.length) throw new FoundationError(409, 'Household has not been initialized');
      const tables = rows[0].tables as Record<string, SqlRow[]>;
      return { revision: String(rows[0].revision), tables, store: decodeState(tables) };
    },
    async save(before: Loaded, next: FinanceDataStore): Promise<string> {
      const writes: Query[] = [];
      for (const [key, [table, map]] of Object.entries(mappings)) {
        const old = (before.store as any)[key] as SqlRow[]; const current = (next as any)[key] as SqlRow[];
        for (const [i, row] of current.entries()) {
          const previous = old.find(r => r.id === row.id);
          const data = { ...encode(row, map), sort_order: i };
          if (!previous || !equal(data, { ...encode(previous, map), sort_order: old.indexOf(previous) })) writes.push(insert(table, data, ['id']));
        }
        for (const row of old.filter(r => !current.some(n => n.id === r.id))) {
          writes.push(q(`UPDATE finance_v2.${table} SET archived_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE household_id=$1 AND id=$2 AND archived_at IS NULL`, [household, row.id]));
        }
      }
      for (const p of next.installmentPurchases) {
        const old = before.store.installmentPurchases.find(x => x.id === p.id);
        for (const v of p.versions ?? []) if (!old?.versions?.some(x => x.revision === v.revision)) writes.push(insert('installment_versions', encodeVersion(p.id, v)));
        for (const m of new Set([...Object.keys(p.statusByMonth ?? {}), ...Object.keys(p.paymentAmountsByMonth ?? {})])) {
          const data = { purchase_id: p.id, month: `${m}-01`, status: p.statusByMonth?.[m] ?? null, amount_override: p.paymentAmountsByMonth?.[m] ?? null };
          if (!old || data.status !== (old.statusByMonth?.[m] ?? null) || data.amount_override !== (old.paymentAmountsByMonth?.[m] ?? null)) {
            writes.push(insert('installment_month_states', data, ['purchase_id', 'month']));
          }
        }
      }
      for (const [m, snapshot] of Object.entries(next.closedMonths ?? {})) {
        if (before.store.closedMonths?.[m]) continue;
        const id = randomUUID(); const date = `${m}-01`;
        const revision = 1 + Math.max(0, ...before.tables.month_closures.filter(c => c.month === date).map(c => c.revision));
        writes.push(q('INSERT INTO finance_v2.financial_months (household_id,month) VALUES ($1,$2) ON CONFLICT (household_id,month) DO NOTHING', [household, date]));
        writes.push(insert('month_closures', { id, month: date, revision, closed_at: snapshot.closedAt, schema_version: 2,
          rules_version: 'finance-v2-temporal-1', payload: JSON.stringify(snapshot) }));
        writes.push(q('UPDATE finance_v2.financial_months SET current_closure_id=$3,updated_at=CURRENT_TIMESTAMP WHERE household_id=$1 AND month=$2', [household, date, id]));
      }
      for (const m of Object.keys(before.store.closedMonths ?? {})) {
        if (next.closedMonths?.[m]) continue;
        const id = before.tables.financial_months.find(r => r.month === `${m}-01`)!.current_closure_id;
        writes.push(insert('month_reopenings', { month: `${m}-01`, closure_id: id, reopened_at: new Date().toISOString(), source: 'command' }));
        writes.push(q('UPDATE finance_v2.financial_months SET current_closure_id=NULL,updated_at=CURRENT_TIMESTAMP WHERE household_id=$1 AND month=$2', [household, `${m}-01`]));
      }
      // Separate lock then assertion: after a wait, READ COMMITTED observes the winner's revision.
      const queries = [q('SELECT id FROM finance_v2.households WHERE id=$1 FOR UPDATE', [household]),
        q(`SELECT 1 / CASE WHEN COALESCE((SELECT revision=$2::bigint FROM finance_v2.households WHERE id=$1),false) THEN 1 ELSE 0 END AS revision_guard`, [household, before.revision]),
        ...writes];
      if (writes.length) queries.push(q('UPDATE finance_v2.households SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=$1', [household]));
      try { await transport.batch(queries, false); }
      catch (error) {
        if ((error as {code?: string}).code === '22012') throw new FoundationError(409, 'State changed; reload before retrying');
        throw error;
      }
      return String(BigInt(before.revision) + (writes.length ? 1n : 0n));
    },
  };
}
