import { addMonths } from '../utils/formatters';
import { parseMobileMoney } from './model';
import { previewCommand } from './conversation';

export interface PhotoAccount { name: string; current: string; count: string; amount: string }
export const emptyPhotoAccount = (): PhotoAccount => ({ name: '', current: '', count: '', amount: '' });

// Only suggest amounts at the end of a line or explicitly marked as currency.
// Keep digits in descriptions (e.g. Loja 100) separate from installment/value fields.
export function parsePhotoAccounts(text: string): PhotoAccount[] {
  const rows: PhotoAccount[] = [];
  let pending = '';
  for (const line of text.split(/\r?\n/).map(s => s.trim()).filter(Boolean)) {
    if (/^(descri[cç][aã]o|nome|loja)\s*[|;]?\s*(parcela|valor)/i.test(line)) continue;
    pending = `${pending} ${line}`.trim();
    const value = /(?:R\s*\$\s*(\d+(?:\.\d{3})*(?:[,.]\d{1,2})?)|(\d+(?:\.\d{3})*[,.]\d{2})|[|;]\s*(\d+(?:\.\d{3})*(?:[,.]\d{1,2})?))\s*$/i.exec(pending);
    if (!value) continue;
    const beforeValue = pending.slice(0, value.index);
    const installment = /\b(\d{1,3})\s*\/\s*(\d{1,3})\b/.exec(beforeValue);
    const name = (installment ? beforeValue.slice(0, installment.index) + beforeValue.slice(installment.index + installment[0].length) : beforeValue)
      .replace(/[|;]/g, ' ').replace(/\s+/g, ' ').trim();
    const raw = value[1] ?? value[2] ?? value[3];
    const amount = raw.includes(',') || /^\d{1,3}(?:\.\d{3})+$/.test(raw) ? raw.replace(/\./g, '') : raw;
    rows.push({ name, current: installment?.[1] ?? '', count: installment?.[2] ?? '', amount: amount.replace('.', ',') });
    pending = '';
  }
  if (pending) rows.push({ ...emptyPhotoAccount(), name: pending.replace(/[|;]/g, ' ').trim() });
  if (rows.length > 20) throw new Error('A foto tem muitas linhas. Envie até 20 contas por foto.');
  return rows;
}

export function photoAccountCommand(row: PhotoAccount, month: string) {
  const amount = parseMobileMoney(row.amount);
  if (!row.name.trim() || row.name.trim().length > 160 || amount === null) throw new Error('Confira o nome e o valor maior que zero (até duas casas decimais).');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Escolha o mês da conta/parcela.');
  let count = 1, current = 1;
  if (row.current || row.count) {
    if (!/^\d+$/.test(row.current) || !/^\d+$/.test(row.count)) throw new Error('Informe a parcela atual e o total, ou deixe ambos vazios para uma conta simples.');
    count = Number(row.count); current = Number(row.current);
    if (count < 1 || count > 120 || current < 1 || current > count) throw new Error('Confira as parcelas: atual de 1 até o total, máximo de 120.');
  }
  const startMonth = addMonths(month, 1 - current);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(startMonth) || startMonth < '1900-01' || startMonth > '9999-12') throw new Error('O início calculado do parcelamento está fora do período permitido.');
  const total = Math.round(amount * 100) * count / 100;
  if (total > 9999999999999.99) throw new Error('O total do parcelamento excede o valor permitido. Confira o valor da parcela.');
  // Same creation command as the conversational preview; never edits existing records.
  const command = previewCommand({ name: row.name.trim(), amount: total, month: startMonth, count, paid: false });
  return { ...command, month: startMonth, total, current, count };
}
