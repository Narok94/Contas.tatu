import { FoundationError } from '../foundation.js';
export const invalid = () => new FoundationError(400, 'Invalid financial command');
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  return value as Record<string, unknown>;
}
export function keys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some(k => !allowed.includes(k))) throw invalid();
}
export function text(value: unknown, optional = false): string | undefined {
  if (optional && (value === undefined || value === null || value === '')) return undefined;
  if (typeof value !== 'string' || !value.trim() || value.length > 1000 || value.includes('\0')) throw invalid();
  return value.trim();
}
export function uuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw invalid();
  return value;
}
export function month(value: unknown): string {
  if (typeof value !== 'string' || !/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw invalid();
  return value;
}
export function money(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 9999999999999.99 ||
    !Number.isSafeInteger(Math.round(value * 100)) || Math.abs(value * 100 - Math.round(value * 100)) > 0.00001) throw invalid();
  return value;
}
export function integer(value: unknown, min = 1, max = 119988): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) throw invalid();
  return value;
}
export function ref(value: unknown, rows: {id: string}[]): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const id = uuid(value);
  if (!rows.some(r => r.id === id)) throw new FoundationError(404, 'Reference not found');
  return id;
}
export function find<T extends {id: string}>(rows: T[], value: unknown): T {
  const id = uuid(value); const row = rows.find(r => r.id === id);
  if (!row) throw new FoundationError(404, 'Financial item not found');
  return row;
}
