import { randomUUID } from 'node:crypto';
import { getNeonClient } from './neon.js';

// Fixed server-owned bootstrap identity. This is not a login or an authorization model.
export const DEFAULT_HOUSEHOLD_ID = 'ad72e2a0-2643-4c2b-9c31-e15d77103101';
const LOCAL_USER_ID = 'ad72e2a0-2643-4c2b-9c31-e15d77103102';
export const DEFAULT_CATEGORIES = [
  { name: 'Casa', color: '#2563eb', description: 'Contas residenciais e manutenção' },
  { name: 'Mercado', color: '#059669', description: 'Supermercado e feira' },
  { name: 'Manoela', color: '#db2777', description: 'Despesas pessoais Manoela' },
  { name: 'Antônio', color: '#7c3aed', description: 'Despesas pessoais Antônio' },
  { name: 'Lazer', color: '#d97706', description: 'Restaurantes, passeios e viagens' },
  { name: 'Saúde', color: '#dc2626', description: 'Médicos, farmácia e exames' },
  { name: 'Transporte', color: '#0891b2', description: 'Combustível, IPVA e oficina' },
].map((category, i) => ({ ...category, id: `ad72e2a0-2643-4c2b-9c31-e15d7710320${i + 1}` }));

export interface Statement { text: string; values: (string | number | null)[] }
export type Row = Record<string, unknown>;
export interface Database {
  transaction(statements: Statement[], readOnly?: boolean): Promise<Row[][]>;
}
const database: Database = {
  async transaction(statements, readOnly = false) {
    const sql = getNeonClient();
    return sql.transaction(statements.map(s => sql.query(s.text, s.values)), {
      readOnly, fetchOptions: { signal: AbortSignal.timeout(15_000) },
    });
  },
};
export class FoundationError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
const statement = (text: string, values: Statement['values'] = []): Statement => ({ text, values });
const fields = 'id, name, color, description';
function category(row: Row) {
  return { id: row.id as string, name: row.name as string, color: row.color as string,
    ...(row.description == null ? {} : { description: row.description as string }) };
}
function validateId(id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new FoundationError(400, 'Invalid category ID');
  }
}
function input(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new FoundationError(400, 'Invalid category');
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some(k => !['name', 'color', 'description'].includes(k)) ||
      typeof v.name !== 'string' || !v.name.trim() || v.name.length > 120 ||
      typeof v.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(v.color) ||
      (v.description !== undefined && (typeof v.description !== 'string' || v.description.length > 1000)) ||
      [v.name, v.description].some(x => typeof x === 'string' && x.includes('\0'))) {
    throw new FoundationError(400, 'Invalid category');
  }
  return { name: v.name.trim(), color: v.color, description: (v.description as string | undefined)?.trim() || null };
}

export function createFoundation(db: Database = database) {
  const lock = () => statement('SELECT id FROM finance_v2.households WHERE id=$1 FOR UPDATE', [DEFAULT_HOUSEHOLD_ID]);
  async function mutate(change: Statement) {
    const results = await db.transaction([lock(), change]);
    if (!results[0].length) throw new FoundationError(409, 'Household has not been initialized');
    if (!results[1].length) throw new FoundationError(404, 'Category not found');
    return category(results[1][0]);
  }
  return {
    // Explicit server operation only; never called automatically by reads or HTTP handlers.
    async initialize() {
      await db.transaction([
        statement('SELECT pg_advisory_xact_lock(721904, 1)'),
        statement(`INSERT INTO finance_v2.households (id, name) VALUES ($1, 'Contas Tatu')
          ON CONFLICT (id) DO NOTHING`, [DEFAULT_HOUSEHOLD_ID]),
        lock(),
        statement(`INSERT INTO finance_v2.app_users (id, auth_issuer, auth_subject, display_name)
          VALUES ($1, 'contas-tatu:controlled-local', 'bootstrap-owner', 'Operador local')
          ON CONFLICT (id) DO NOTHING`, [LOCAL_USER_ID]),
        statement(`INSERT INTO finance_v2.household_memberships (household_id, user_id, role)
          VALUES ($1, $2, 'owner') ON CONFLICT (household_id, user_id) DO NOTHING`, [DEFAULT_HOUSEHOLD_ID, LOCAL_USER_ID]),
        ...DEFAULT_CATEGORIES.map((c, i) => statement(`INSERT INTO finance_v2.categories
          (household_id, id, name, color, description, sort_order) VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (household_id, id) DO NOTHING`, [DEFAULT_HOUSEHOLD_ID, c.id, c.name, c.color, c.description, i])),
      ]);
      return this.getDefaultHousehold();
    },
    async getDefaultHousehold() {
      const [rows] = await db.transaction([statement('SELECT id, name FROM finance_v2.households WHERE id=$1', [DEFAULT_HOUSEHOLD_ID])], true);
      if (!rows.length) throw new FoundationError(409, 'Household has not been initialized');
      return { id: rows[0].id as string, name: rows[0].name as string };
    },
    async listCategories() {
      const [rows] = await db.transaction([statement(`SELECT ${fields} FROM finance_v2.categories
        WHERE household_id=$1 AND archived_at IS NULL ORDER BY sort_order, id`, [DEFAULT_HOUSEHOLD_ID])], true);
      return rows.map(category);
    },
    async createCategory(value: unknown) {
      const c = input(value);
      return mutate(statement(`WITH changed AS (
        INSERT INTO finance_v2.categories (household_id, id, name, color, description, sort_order)
        SELECT $1, $2, $3, $4, $5, COALESCE((SELECT MAX(sort_order)+1 FROM finance_v2.categories WHERE household_id=$1), 0)
        FROM finance_v2.households WHERE id=$1 RETURNING ${fields}
      ), revision AS (UPDATE finance_v2.households SET revision=revision+1, updated_at=CURRENT_TIMESTAMP
        WHERE id=$1 AND EXISTS(SELECT 1 FROM changed)) SELECT * FROM changed`,
      [DEFAULT_HOUSEHOLD_ID, randomUUID(), c.name, c.color, c.description]));
    },
    async editCategory(id: string, value: unknown) {
      validateId(id);
      const c = input(value);
      return mutate(statement(`WITH changed AS (
        UPDATE finance_v2.categories SET name=$3, color=$4, description=$5, updated_at=CURRENT_TIMESTAMP
        WHERE household_id=$1 AND id=$2 AND archived_at IS NULL RETURNING ${fields}
      ), revision AS (UPDATE finance_v2.households SET revision=revision+1, updated_at=CURRENT_TIMESTAMP
        WHERE id=$1 AND EXISTS(SELECT 1 FROM changed)) SELECT * FROM changed`,
      [DEFAULT_HOUSEHOLD_ID, id, c.name, c.color, c.description]));
    },
    async archiveCategory(id: string) {
      validateId(id);
      await mutate(statement(`WITH changed AS (
        UPDATE finance_v2.categories SET archived_at=COALESCE(archived_at, CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP
        WHERE household_id=$1 AND id=$2 RETURNING ${fields}
      ), revision AS (UPDATE finance_v2.households SET revision=revision+1, updated_at=CURRENT_TIMESTAMP
        WHERE id=$1 AND EXISTS(SELECT 1 FROM changed)) SELECT * FROM changed`, [DEFAULT_HOUSEHOLD_ID, id]));
      return { id, archived: true };
    },
  };
}
