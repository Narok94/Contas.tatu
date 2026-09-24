import { InstallmentPurchase, InstallmentVersion } from '../types/finance';
import { addMonths, getMonthDifference } from '../utils/formatters';

export function assertInstallmentMonth(month: string) {
  if (!/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Mês de parcelamento inválido.');
}

export function assertInstallmentMoney(value: number) {
  if (!Number.isFinite(value) || value < 0 || value > 9999999999999.99 ||
      !Number.isSafeInteger(Math.round(value * 100)) || Math.abs(value * 100 - Math.round(value * 100)) > 0.00001) {
    throw new Error('Valor de parcelamento inválido; informe centavos não negativos.');
  }
}

/** Legacy uniform rounding is intentional and versioned; no residual redistribution. */
export function calculateInstallmentValue(totalAmount: number, installmentsCount: number): number {
  if (installmentsCount <= 0) return 0;
  return Math.round((totalAmount / installmentsCount) * 100) / 100;
}

export function initialInstallmentVersion(p: InstallmentPurchase): InstallmentVersion {
  return { revision: 1, operation: 'initial', effectiveFromMonth: p.effectiveFromMonth || p.startMonth,
    description: p.description, totalAmount: p.totalAmount, installmentsCount: p.installmentsCount,
    baseInstallmentNumber: p.baseInstallmentNumber || 1, creditCardId: p.creditCardId,
    categoryId: p.categoryId, roundingRule: 'legacy_uniform', recordedAt: '', reason: 'Configuração legada; instante desconhecido' };
}

export function installmentVersions(p: InstallmentPurchase): InstallmentVersion[] {
  return p.versions?.length ? p.versions : [initialInstallmentVersion(p)];
}

/** A month correction has priority only in its own month. Forward boundaries are half-open. */
export function resolveInstallmentVersion(p: InstallmentPurchase, month: string): InstallmentVersion {
  const versions = installmentVersions(p);
  const corrections = versions.filter(v => v.operation === 'correction' && v.effectiveFromMonth === month);
  if (corrections.length) return { ...corrections.reduce((a, b) => a.revision > b.revision ? a : b) };
  const eligible = versions.filter(v => v.operation !== 'correction' && v.effectiveFromMonth <= month);
  return { ...(eligible.sort((a, b) => b.effectiveFromMonth.localeCompare(a.effectiveFromMonth) || b.revision - a.revision)[0]
    ?? versions[0]) };
}

function scheduleEnd(month: string, count: number, base: number): string {
  const [year, m] = month.split('-').map(Number);
  const end = (year - 1) * 12 + m - 1 + count - base;
  if (!Number.isSafeInteger(end) || end < 0 || end > 119987) return '';
  return `${String(Math.floor(end / 12) + 1).padStart(4, '0')}-${String(end % 12 + 1).padStart(2, '0')}`;
}

export function getInstallmentStatusForMonth(p: InstallmentPurchase, month: string) {
  const v = resolveInstallmentVersion(p, month);
  const baseline = installmentVersions(p)[0];
  const snapshot = p.monthlySnapshots?.[month];
  // Existing snapshots retain priority over the imported baseline, never over explicit new corrections.
  if (snapshot && v.operation === 'initial') {
    return { isActive: true, currentInstallment: snapshot.currentInstallment,
      totalInstallments: snapshot.totalInstallments, remainingInstallments: snapshot.remainingInstallments,
      installmentAmount: snapshot.installmentAmount, endMonth: snapshot.endMonth,
      description: snapshot.description || baseline.description,
      categoryId: snapshot.categoryAssignmentKnown ? snapshot.categoryId : snapshot.categoryId ?? baseline.categoryId,
      creditCardId: snapshot.cardAssignmentKnown ? snapshot.creditCardId : baseline.creditCardId,
      totalAmount: snapshot.totalAmount ?? snapshot.installmentAmount * snapshot.totalInstallments,
      operation: v.operation, revision: v.revision };
  }
  const current = v.baseInstallmentNumber + getMonthDifference(v.effectiveFromMonth, month);
  const ended = v.operation === 'cancel' || (v.operation === 'payoff' && month !== v.effectiveFromMonth);
  const payoff = v.operation === 'payoff' && month === v.effectiveFromMonth;
  const isActive = !ended && month >= v.effectiveFromMonth && current >= 1 && current <= v.installmentsCount;
  return { isActive, currentInstallment: payoff ? v.installmentsCount : Math.max(0, current),
    totalInstallments: v.installmentsCount,
    remainingInstallments: payoff || ended ? 0 : Math.max(0, v.installmentsCount - current),
    installmentAmount: payoff ? v.payoffAmount! : calculateInstallmentValue(v.totalAmount, v.installmentsCount),
    endMonth: payoff || ended ? v.effectiveFromMonth : scheduleEnd(v.effectiveFromMonth, v.installmentsCount, v.baseInstallmentNumber),
    description: v.description, categoryId: v.categoryId, creditCardId: v.creditCardId,
    totalAmount: v.totalAmount, operation: v.operation, revision: v.revision };
}

export interface InstallmentChange {
  description: string;
  totalAmount: number;
  installmentsCount: number;
  currentInstallment?: number;
  categoryId?: string;
  /** undefined preserves the resolved card; empty string explicitly detaches. */
  creditCardId?: string;
}

export function appendInstallmentVersion(p: InstallmentPurchase, month: string,
  operation: Exclude<InstallmentVersion['operation'], 'initial'>, data: InstallmentChange,
  reason: string, payoffAmount?: number): InstallmentPurchase {
  assertInstallmentMonth(month);
  assertInstallmentMoney(data.totalAmount);
  if (!data.description.trim() || !reason.trim()) throw new Error('Descrição e motivo são obrigatórios.');
  const base = data.currentInstallment ?? 1;
  if (!Number.isInteger(data.installmentsCount) || data.installmentsCount < 1 ||
      !Number.isInteger(base) || base < 1 || base > data.installmentsCount) throw new Error('Quantidade ou parcela atual inválida.');
  assertInstallmentMonth(scheduleEnd(month, data.installmentsCount, base));
  const versions = installmentVersions(p);
  const before = getInstallmentStatusForMonth(p, month);
  if (!before.isActive) throw new Error('O parcelamento não está ativo neste mês.');
  if (operation !== 'correction' && (versions.some(v => v.effectiveFromMonth > month) ||
      versions.some(v => v.operation === 'correction' && v.effectiveFromMonth >= month) ||
      Object.keys(p.monthlySnapshots ?? {}).some(m => m >= month))) {
    throw new Error('Há alterações posteriores. Use correção explícita de um mês.');
  }
  if (versions.some(v => (v.operation === 'cancel' || v.operation === 'payoff') &&
      (operation !== 'correction' || month >= v.effectiveFromMonth))) {
    throw new Error('Encerramento já registrado; não pode ser sobrescrito.');
  }
  if (operation === 'payoff') assertInstallmentMoney(payoffAmount!);
  const version: InstallmentVersion = { revision: Math.max(...versions.map(v => v.revision)) + 1,
    operation, effectiveFromMonth: month, description: data.description.trim(), totalAmount: data.totalAmount,
    installmentsCount: data.installmentsCount, baseInstallmentNumber: base,
    categoryId: data.categoryId, creditCardId: data.creditCardId === undefined ? before.creditCardId : data.creditCardId || undefined,
    roundingRule: 'legacy_uniform', recordedAt: new Date().toISOString(), reason: reason.trim(),
    ...(operation === 'payoff' ? { payoffAmount } : {}) };
  // Compatibility fields serve existing editors only. All financial reads resolve versions.
  const projection = operation === 'change' ? { description: version.description, totalAmount: version.totalAmount,
    installmentsCount: version.installmentsCount, effectiveFromMonth: month,
    baseInstallmentNumber: base, creditCardId: version.creditCardId, categoryId: version.categoryId } : {};
  return { ...p, ...projection, versions: [...versions, version] };
}

/** Enumerate relevant past occurrences in memory only; no persisted calendar or arbitrary cap. */
export function installmentMonthsBefore(p: InstallmentPurchase, target: string): string[] {
  const months = new Set(Object.keys(p.monthlySnapshots ?? {}).filter(m => m < target));
  for (const v of installmentVersions(p)) {
    if (v.operation === 'cancel') continue;
    const count = v.operation === 'payoff' || v.operation === 'correction' ? 1 : v.installmentsCount - v.baseInstallmentNumber + 1;
    const limit = Math.min(count, Math.max(0, getMonthDifference(v.effectiveFromMonth, target)));
    for (let i = 0; i < limit; i++) months.add(addMonths(v.effectiveFromMonth, i));
  }
  return [...months].sort();
}
