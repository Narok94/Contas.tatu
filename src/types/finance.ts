export type AccountType = 'simple' | 'recurring' | 'installment' | 'credit_card';

export type PaymentStatus = 'pendente' | 'parcial' | 'pago';

export interface Category {
  id: string;
  name: string;
  color: string;
  description?: string;
}

/**
 * Conta simples: criada apenas para o mês especificado
 */
export interface SimpleAccount {
  id: string;
  name: string;
  value: number;
  month: string; // formato YYYY-MM
  categoryId?: string;
  status: PaymentStatus;
  notes?: string;
  createdAt: string;
}

/**
 * Definição da conta fixa/recorrente.
 * Aparece automaticamente em todos os meses subsequentes,
 * porém com valor R$ 0,00 inicial em cada novo mês.
 */
export interface RecurringAccountDefinition {
  id: string;
  name: string;
  categoryId?: string;
  startMonth: string; // formato YYYY-MM
  isActive: boolean;
  notes?: string;
  createdAt: string;
}

/**
 * Registro do valor e status de uma conta fixa em um mês específico.
 */
export interface RecurringAccountMonthlyRecord {
  id: string;
  definitionId: string;
  month: string; // formato YYYY-MM
  value: number; // começa em 0.00 se não definido
  isValueSet: boolean; // se o usuário já informou o valor daquele mês
  status: PaymentStatus;
  notes?: string;
}

/**
 * Cartão de crédito (conta-mãe / agregador de faturas)
 */
export interface CreditCard {
  id: string;
  name: string;
  brand?: string;
  color?: string;
  createdAt: string;
}

/**
 * Status mensal da fatura do cartão de crédito
 */
export interface CreditCardMonthlyInvoice {
  id: string;
  cardId: string;
  month: string; // YYYY-MM
  status: PaymentStatus;
  /** Total efetivamente pago neste mês; ausente em registros legados. */
  paidAmount?: number;
  manualAdjustment?: number; // caso haja ajuste manual
  paidAt?: string;
}

/**
 * Compra avulsa feita dentro do cartão de crédito em um mês específico
 */
export interface CardSimpleExpense {
  id: string;
  cardId: string;
  description: string;
  amount: number;
  month: string; // YYYY-MM
  categoryId?: string;
  createdAt: string;
}

/**
 * Snapshot de histórico imutável de uma parcela em um determinado mês
 */
export interface InstallmentPurchaseSnapshot {
  currentInstallment: number;
  totalInstallments: number;
  remainingInstallments: number;
  installmentAmount: number;
  endMonth: string;
  description?: string;
  categoryId?: string;
  totalAmount?: number;
}

/**
 * Compra parcelada.
 * Pode pertencer a um cartão de crédito OU ser um parcelamento avulso/independente.
 */
export interface InstallmentPurchase {
  id: string;
  description: string;
  totalAmount: number;
  installmentsCount: number;
  startMonth: string; // YYYY-MM da primeira parcela
  creditCardId?: string; // se presente, compõe o cartão
  categoryId?: string;
  // Status para parcelamento independente caso não esteja em cartão
  statusByMonth?: Record<string, PaymentStatus>;
  paymentAmountsByMonth?: Record<string, number>;
  notes?: string;
  createdAt: string;

  // Preservação de histórico imutável
  monthlySnapshots?: Record<string, InstallmentPurchaseSnapshot>;
  effectiveFromMonth?: string;
  baseInstallmentNumber?: number;
}

/**
 * Item interno de uma fatura de cartão de crédito no mês
 */
export interface CardInternalItem {
  id: string;
  description: string;
  amount: number;
  categoryId?: string;
  category?: Category;
  isInstallment: boolean;
  installmentInfo?: {
    current: number;
    total: number;
    remaining: number;
    purchaseId: string;
    endMonth?: string;
    totalAmount?: number;
  };
  sourceType: 'simple_expense' | 'installment';
  sourceId: string;
}

/**
 * Pendência anterior de fatura de cartão de crédito
 */
export interface CardPendingPreviousInvoice {
  month: string;
  amount: number;
}

/**
 * Item unificado de conta para exibição na grade do mês
 */
export interface UnifiedMonthlyAccount {
  id: string;
  type: AccountType;
  name: string;
  amount: number;
  status: PaymentStatus;
  categoryId?: string;
  category?: Category;
  notes?: string;
  // Metadados específicos de cada tipo
  recurringInfo?: {
    definitionId: string;
    isValueSet: boolean;
  };
  installmentInfo?: {
    purchaseId: string;
    currentInstallment: number;
    totalInstallments: number;
    remainingInstallments: number;
    endMonth: string;
    totalAmount?: number;
  };
  cardInfo?: {
    cardId: string;
    invoiceStatus: PaymentStatus;
    items: CardInternalItem[];
    totalItemsCount: number;
    currentMonthAmount: number;
    previousPendingAmount: number;
    previousPendingInvoices: CardPendingPreviousInvoice[];
    totalOpenAmount: number;
    paidAmount?: number;
  };
}

/**
 * Resumo financeiro do mês
 */
export interface MonthFinancialSummary {
  month: string;
  totalExpected: number;
  totalPaid: number;
  totalPending: number;
  previousPendingCardsTotal: number;
  totalOpenWithPreviousPending: number;
  pendingCount: number;
  totalCount: number;
  categoryBreakdown: {
    categoryId: string;
    categoryName: string;
    categoryColor: string;
    total: number;
    percentage: number;
  }[];
  activeEndingInstallments: {
    purchaseId: string;
    description: string;
    currentInstallment: number;
    totalInstallments: number;
    remaining: number;
    amount: number;
    endMonth: string;
    cardName?: string;
  }[];
}

export interface ClosedMonthSnapshot {
  month: string;
  closedAt: string;
  accounts: UnifiedMonthlyAccount[];
  summary: MonthFinancialSummary;
}
