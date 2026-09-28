import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFoundation, DEFAULT_CATEGORIES, DEFAULT_HOUSEHOLD_ID, type Database, type Row, type Statement } from '../server/foundation.js';

// In-memory SQL boundary double; real SQL bootstrap is validated separately, explicitly.
class MemoryDatabase implements Database {
  households = new Map<string, Row>();
  users = new Map<string, Row>();
  memberships = new Map<string, Row>();
  categories = new Map<string, Row>();
  calls: Statement[][] = [];
  async transaction(statements: Statement[], readOnly = false): Promise<Row[][]> {
    this.calls.push(statements);
    return statements.map(({ text, values: v }) => {
      assert.ok(!/\bDELETE\s+FROM\b/i.test(text));
      if (readOnly) assert.ok(!/\b(?:INSERT|UPDATE)\b/.test(text));
      if (text.includes('pg_advisory_xact_lock')) return [];
      if (text.startsWith('INSERT INTO finance_v2.households')) {
        assert.match(text, /ON CONFLICT \(id\) DO NOTHING/);
        if (!this.households.has(String(v[0]))) this.households.set(String(v[0]), { id: v[0], name: 'Contas Tatu' });
        return [];
      }
      if (text.startsWith('INSERT INTO finance_v2.app_users')) {
        assert.match(text, /ON CONFLICT \(id\) DO NOTHING/);
        if (!this.users.has(String(v[0]))) this.users.set(String(v[0]), { id: v[0] });
        return [];
      }
      if (text.startsWith('INSERT INTO finance_v2.household_memberships')) {
        assert.match(text, /ON CONFLICT \(household_id, user_id\) DO NOTHING/);
        this.memberships.set(`${v[0]}:${v[1]}`, { role: 'owner' }); return [];
      }
      if (text.startsWith('INSERT INTO finance_v2.categories')) {
        assert.match(text, /ON CONFLICT \(household_id, id\) DO NOTHING/);
        if (!this.categories.has(String(v[1]))) this.categories.set(String(v[1]), {
          household_id: v[0], id: v[1], name: v[2], color: v[3], description: v[4], sort_order: v[5], archived_at: null,
        });
        return [];
      }
      if (text.startsWith('SELECT') && text.includes('FROM finance_v2.households')) {
        const row = this.households.get(String(v[0])); return row ? [row] : [];
      }
      if (text.startsWith('SELECT') && text.includes('FROM finance_v2.categories')) {
        assert.match(text, /household_id=\$1 AND archived_at IS NULL/);
        return [...this.categories.values()].filter(c => c.household_id === v[0] && c.archived_at === null)
          .sort((a, b) => Number(a.sort_order) - Number(b.sort_order));
      }
      assert.equal(v[0], DEFAULT_HOUSEHOLD_ID);
      assert.match(text, /revision=revision\+1/);
      if (text.includes('INSERT INTO finance_v2.categories')) {
        const row = { household_id: v[0], id: v[1], name: v[2], color: v[3], description: v[4], sort_order: this.categories.size, archived_at: null };
        this.categories.set(String(v[1]), row); return [row];
      }
      const row = this.categories.get(String(v[1]));
      if (!row || row.household_id !== v[0]) return [];
      if (text.includes('SET archived_at=')) { row.archived_at = 'archived'; return [row]; }
      assert.match(text, /AND archived_at IS NULL/);
      if (row.archived_at !== null) return [];
      Object.assign(row, { name: v[2], color: v[3], description: v[4] }); return [row];
    });
  }
}

test('bootstrap is idempotent and preserves the seven product categories', async () => {
  const db = new MemoryDatabase(); const service = createFoundation(db);
  const first = await service.initialize(); const second = await service.initialize();
  assert.deepEqual(first, second);
  assert.deepEqual([db.households.size, db.users.size, db.memberships.size, db.categories.size], [1, 1, 1, 7]);
  assert.deepEqual((await service.listCategories()).map(c => c.name), ['Casa', 'Mercado', 'Manoela', 'Antônio', 'Lazer', 'Saúde', 'Transporte']);
  assert.equal(new Set(DEFAULT_CATEGORIES.map(c => c.id)).size, 7);
  assert.match(db.calls[0][0].text, /pg_advisory_xact_lock/);
});

test('create/edit/archive preserve IDs, hide archived categories and do not reseed edits', async () => {
  const db = new MemoryDatabase(); const service = createFoundation(db); await service.initialize();
  const added = await service.createCategory({ name: '  Educação  ', color: '#123abc', description: '  Cursos  ' });
  assert.equal(added.name, 'Educação'); assert.equal(added.description, 'Cursos');
  const edited = await service.editCategory(added.id, { name: 'Estudos', color: '#123abc' });
  assert.equal(edited.id, added.id);
  await service.archiveCategory(added.id);
  assert.ok(db.categories.has(added.id));
  assert.ok(!(await service.listCategories()).some(c => c.id === added.id));
  await assert.rejects(service.editCategory(added.id, { name: 'Again', color: '#123abc' }), /not found/);
  const seed = DEFAULT_CATEGORIES[0];
  await service.editCategory(seed.id, { name: 'Moradia', color: '#123abc' });
  await service.archiveCategory(seed.id);
  await service.initialize();
  assert.equal(db.categories.get(seed.id)?.name, 'Moradia');
  assert.equal(db.categories.get(seed.id)?.archived_at, 'archived');
  assert.equal(db.categories.size, 8);
  for (const batch of db.calls.filter(b => b.some(s => s.text.startsWith('WITH changed')))) assert.match(batch[0].text, /FOR UPDATE/);
});

test('invalid inputs and client household selection are rejected before querying', async () => {
  const db = new MemoryDatabase(); const service = createFoundation(db);
  for (const value of [null, [], {}, { name: ' ', color: '#123456' }, { name: 'X', color: 'red' },
    { name: 'X', color: '#123456', household_id: 'other' }, { name: 'X', color: '#123456', description: 42 }]) {
    await assert.rejects(service.createCategory(value), /Invalid category/);
  }
  await assert.rejects(service.archiveCategory('invalid'), /Invalid category ID/);
  assert.equal(db.calls.length, 0);
  await assert.rejects(service.getDefaultHousehold(), /not been initialized/);
});
