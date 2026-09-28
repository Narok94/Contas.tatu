import type { FinanceDataStore } from '../../src/domain/financeRules.js';
import type { InstallmentPurchase, InstallmentVersion, ClosedMonthSnapshot } from '../../src/types/finance.js';

// SQL identifiers below are fixed mappings, never request input.
export type SqlRow = Record<string, any>;
export const mappings = {
  creditCards: ['credit_cards', { id: 'id', name: 'name', brand: 'brand', color: 'color', createdAt: 'created_at' }],
  simpleAccounts: ['simple_accounts', { id: 'id', name: 'name', value: 'amount', month: 'month', categoryId: 'category_id', status: 'status', notes: 'notes', createdAt: 'created_at' }],
  recurringDefinitions: ['recurring_definitions', { id: 'id', name: 'name', categoryId: 'category_id', startMonth: 'start_month', isActive: 'is_active', notes: 'notes', createdAt: 'created_at' }],
  recurringMonthlyRecords: ['recurring_monthly_records', { id: 'id', definitionId: 'definition_id', month: 'month', value: 'amount', isValueSet: 'is_value_set', status: 'status', notes: 'notes' }],
  installmentPurchases: ['installment_purchases', { id: 'id', startMonth: 'start_month', notes: 'notes', createdAt: 'created_at' }],
  cardExpenses: ['card_expenses', { id: 'id', cardId: 'card_id', description: 'description', amount: 'amount', month: 'month', categoryId: 'category_id', createdAt: 'created_at' }],
  cardMonthlyInvoices: ['card_monthly_invoices', { id: 'id', cardId: 'card_id', month: 'month', status: 'recorded_status', paidAmount: 'paid_amount', manualAdjustment: 'manual_adjustment', paidAt: 'paid_at' }],
} as const;
const versionMap = { revision: 'revision', operation: 'operation', effectiveFromMonth: 'effective_from_month', description: 'description', totalAmount: 'total_amount', installmentsCount: 'installments_count', baseInstallmentNumber: 'base_installment_number', creditCardId: 'credit_card_id', categoryId: 'category_id', roundingRule: 'rounding_rule', payoffAmount: 'payoff_amount', reason: 'reason', recordedAt: 'occurred_at' };
const snapshotMap = { currentInstallment: 'current_installment', totalInstallments: 'total_installments', remainingInstallments: 'remaining_installments', installmentAmount: 'installment_amount', endMonth: 'end_month', description: 'description', categoryId: 'category_id_snapshot', totalAmount: 'total_amount', creditCardId: 'card_id_snapshot', cardAssignmentKnown: 'card_assignment_known', categoryAssignmentKnown: 'category_assignment_known' };
const monthFields = new Set(['month', 'startMonth', 'effectiveFromMonth', 'endMonth']);
export function decode(row: SqlRow, map: Record<string, string>): SqlRow {
  return Object.fromEntries(Object.entries(map).filter(([, column]) => row[column] != null).map(([field, column]) =>
    [field, monthFields.has(field) ? String(row[column]).slice(0, 7) : row[column]]));
}
export function encode(row: SqlRow, map: Record<string, string>): SqlRow {
  return Object.fromEntries(Object.entries(map).map(([field, column]) => [column,
    row[field] == null ? null : monthFields.has(field) ? `${row[field]}-01` : row[field]]));
}
export function encodeVersion(purchaseId: string, v: InstallmentVersion): SqlRow {
  return { purchase_id: purchaseId, ...encode(v, versionMap), occurred_at: v.recordedAt || null };
}
export function decodeState(tables: Record<string, SqlRow[]>): FinanceDataStore {
  const s = { closedMonths: {}, closedMonthHistory: {}, categories: tables.categories.filter(r => !r.archived_at).map(r => decode(r, { id: 'id', name: 'name', color: 'color', description: 'description' })) } as unknown as FinanceDataStore;
  for (const [key, [table, map]] of Object.entries(mappings)) {
    (s as any)[key] = tables[table].filter(r => !r.archived_at).map(r => decode(r, map));
  }
  s.installmentPurchases = s.installmentPurchases.map(base => {
    const versions = tables.installment_versions.filter(v => v.purchase_id === base.id).map(v => ({ ...decode(v, versionMap), recordedAt: v.occurred_at ?? '' })) as InstallmentVersion[];
    if (!versions.length) throw new Error('Missing initial installment version');
    const projection = [...versions].reverse().find(v => v.operation === 'change' || v.operation === 'initial')!;
    const states = tables.installment_month_states.filter(r => r.purchase_id === base.id);
    const snapshots = tables.installment_month_snapshots.filter(r => r.purchase_id === base.id);
    return { ...base, description: projection.description, totalAmount: projection.totalAmount,
      installmentsCount: projection.installmentsCount, baseInstallmentNumber: projection.baseInstallmentNumber,
      effectiveFromMonth: projection.effectiveFromMonth, categoryId: projection.categoryId, creditCardId: projection.creditCardId,
      versions, statusByMonth: Object.fromEntries(states.filter(r => r.status != null).map(r => [r.month.slice(0, 7), r.status])),
      paymentAmountsByMonth: Object.fromEntries(states.filter(r => r.amount_override != null).map(r => [r.month.slice(0, 7), r.amount_override])),
      ...(snapshots.length ? { monthlySnapshots: Object.fromEntries(snapshots.map(r => [r.month.slice(0, 7), decode(r, snapshotMap)])) } : {}),
    } as InstallmentPurchase;
  });
  for (const r of tables.financial_months) {
    if (!r.current_closure_id) continue;
    const closure = tables.month_closures.find(c => c.id === r.current_closure_id && c.month === r.month);
    if (!closure) throw new Error('Invalid closure pointer');
    s.closedMonths![r.month.slice(0, 7)] = closure.payload as ClosedMonthSnapshot;
  }
  for (const closure of tables.month_closures) {
    if (tables.month_reopenings.some(r => r.closure_id === closure.id && r.month === closure.month)) {
      (s.closedMonthHistory![closure.month.slice(0, 7)] ??= []).push(closure.payload);
    }
  }
  return s;
}
