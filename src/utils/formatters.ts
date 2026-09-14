/**
 * Formatador de moeda brasileira (Real - R$)
 */
export function formatBRL(value: number | null | undefined): string {
  const num = typeof value === 'number' && !isNaN(value) ? value : 0;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

/**
 * Obtém o mês atual no formato YYYY-MM
 * Respeita a data do sistema (ex: 2026-09)
 */
export function getCurrentMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

const MONTH_NAMES_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

export const MONTH_SHORT_NAMES_PT = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
];

/**
 * Formata o mês de término no formato "MêsCurto/AAAA", ex: "Abr/2028"
 */
export function formatMonthEnd(monthStr: string): string {
  if (!monthStr || !monthStr.includes('-')) return monthStr;
  const [yearStr, monthNumStr] = monthStr.split('-');
  const monthIdx = parseInt(monthNumStr, 10) - 1;
  if (monthIdx >= 0 && monthIdx < 12) {
    return `${MONTH_SHORT_NAMES_PT[monthIdx]}/${yearStr}`;
  }
  return monthStr;
}

/**
 * Calcula o mês final de um parcelamento a partir do mês atual, da parcela atual e do total de parcelas
 */
export function calculateInstallmentEndMonth(
  currentMonthStr: string,
  currentInstallment: number,
  totalInstallments: number
): string {
  const remaining = Math.max(0, totalInstallments - currentInstallment);
  return addMonths(currentMonthStr, remaining);
}

/**
 * Converte YYYY-MM em "Mês Ano", ex: "Setembro 2026"
 */
export function formatMonthYear(monthStr: string): string {
  if (!monthStr || !monthStr.includes('-')) return monthStr;
  const [yearStr, monthNumStr] = monthStr.split('-');
  const monthIdx = parseInt(monthNumStr, 10) - 1;
  const year = parseInt(yearStr, 10);
  if (monthIdx >= 0 && monthIdx < 12) {
    return `${MONTH_NAMES_PT[monthIdx]} ${year}`;
  }
  return monthStr;
}

/**
 * Converte YYYY-MM em versão curta, ex: "Set 2026" ou "Set"
 */
export function formatMonthShort(monthStr: string, includeYear = false): string {
  if (!monthStr || !monthStr.includes('-')) return monthStr;
  const [yearStr, monthNumStr] = monthStr.split('-');
  const monthIdx = parseInt(monthNumStr, 10) - 1;
  const year = yearStr.slice(-2);
  if (monthIdx >= 0 && monthIdx < 12) {
    return includeYear ? `${MONTH_SHORT_NAMES_PT[monthIdx]} '${year}` : MONTH_SHORT_NAMES_PT[monthIdx];
  }
  return monthStr;
}

/**
 * Adiciona ou subtrai meses de uma string YYYY-MM
 */
export function addMonths(monthStr: string, offset: number): string {
  if (!monthStr || !monthStr.includes('-')) return monthStr;
  const [yearStr, monthNumStr] = monthStr.split('-');
  let year = parseInt(yearStr, 10);
  let month = parseInt(monthNumStr, 10) + offset;

  while (month > 12) {
    month -= 12;
    year += 1;
  }
  while (month < 1) {
    month += 12;
    year -= 1;
  }

  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Calcula a diferença em meses entre dois meses (toMonth - fromMonth)
 */
export function getMonthDifference(fromMonth: string, toMonth: string): number {
  if (!fromMonth || !toMonth) return 0;
  const [fromY, fromM] = fromMonth.split('-').map(Number);
  const [toY, toM] = toMonth.split('-').map(Number);
  return (toY - fromY) * 12 + (toM - fromM);
}

/**
 * Compara dois meses YYYY-MM
 * Retorna negativo se m1 < m2, 0 se igual, positivo se m1 > m2
 */
export function compareMonths(m1: string, m2: string): number {
  return m1.localeCompare(m2);
}
