import { FinanceDataStore } from '../domain/financeRules';
import {
  CardSimpleExpense,
  Category,
  CreditCard,
  CreditCardMonthlyInvoice,
  InstallmentPurchase,
  PaymentStatus,
  RecurringAccountDefinition,
  RecurringAccountMonthlyRecord,
  SimpleAccount,
} from '../types/finance';

const STORAGE_KEY = 'organizacao_financeira_store_v1';

/**
 * Categorias iniciais para casal
 */
const DEFAULT_CATEGORIES: Category[] = [
  { id: 'cat_casa', name: 'Casa', color: '#2563eb', description: 'Contas residenciais e manutenção' },
  { id: 'cat_mercado', name: 'Mercado', color: '#059669', description: 'Supermercado e feira' },
  { id: 'cat_manoela', name: 'Manoela', color: '#db2777', description: 'Despesas pessoais Manoela' },
  { id: 'cat_antonio', name: 'Antônio', color: '#7c3aed', description: 'Despesas pessoais Antônio' },
  { id: 'cat_lazer', name: 'Lazer', color: '#d97706', description: 'Restaurantes, passeios e viagens' },
  { id: 'cat_saude', name: 'Saúde', color: '#dc2626', description: 'Médicos, farmácia e exames' },
  { id: 'cat_transporte', name: 'Transporte', color: '#0891b2', description: 'Combustível, IPVA e oficina' },
];

/**
 * Cartão de crédito padrão
 */
const DEFAULT_CARDS: CreditCard[] = [
  {
    id: 'card_nubank',
    name: 'Cartão Nubank Casal',
    brand: 'Mastercard',
    color: '#820ad1',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

/**
 * Contas Fixas / Recorrentes cadastradas
 */
const DEFAULT_RECURRING_DEFINITIONS: RecurringAccountDefinition[] = [
  {
    id: 'rec_energia',
    name: 'Energia Elétrica (Enel)',
    categoryId: 'cat_casa',
    startMonth: '2026-01',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'rec_agua',
    name: 'Água e Esgoto (Sabesp)',
    categoryId: 'cat_casa',
    startMonth: '2026-01',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'rec_internet',
    name: 'Internet Fibra Óptica',
    categoryId: 'cat_casa',
    startMonth: '2026-01',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'rec_academia',
    name: 'Academia Casal (Plano Família)',
    categoryId: 'cat_saude',
    startMonth: '2026-01',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

/**
 * Registros mensais já preenchidos para Setembro 2026
 * Note que para Outubro 2026 não há registros, logo começam em R$ 0,00!
 */
const DEFAULT_RECURRING_RECORDS: RecurringAccountMonthlyRecord[] = [
  {
    id: 'rec_rec_energia_2026-09',
    definitionId: 'rec_energia',
    month: '2026-09',
    value: 270.0,
    isValueSet: true,
    status: 'pago',
  },
  {
    id: 'rec_rec_agua_2026-09',
    definitionId: 'rec_agua',
    month: '2026-09',
    value: 85.0,
    isValueSet: true,
    status: 'pago',
  },
  {
    id: 'rec_rec_internet_2026-09',
    definitionId: 'rec_internet',
    month: '2026-09',
    value: 149.9,
    isValueSet: true,
    status: 'pago',
  },
  {
    id: 'rec_rec_academia_2026-09',
    definitionId: 'rec_academia',
    month: '2026-09',
    value: 220.0,
    isValueSet: true,
    status: 'pendente',
  },
];

/**
 * Contas simples de Setembro 2026
 */
const DEFAULT_SIMPLE_ACCOUNTS: SimpleAccount[] = [
  {
    id: 'simp_ar_condicionado',
    name: 'Manutenção Preventiva Ar-Condicionado',
    value: 180.0,
    month: '2026-09',
    categoryId: 'cat_casa',
    status: 'pendente',
    createdAt: '2026-09-02T10:00:00.000Z',
  },
  {
    id: 'simp_dentista_antonio',
    name: 'Consulta e Limpeza Dentista (Antônio)',
    value: 350.0,
    month: '2026-09',
    categoryId: 'cat_saude',
    status: 'pendente',
    createdAt: '2026-09-05T14:00:00.000Z',
  },
];

/**
 * Compras parceladas (algumas dentro do cartão, outra avulsa)
 */
const DEFAULT_INSTALLMENTS: InstallmentPurchase[] = [
  {
    id: 'inst_tv',
    description: 'Smart TV 55" Sala',
    totalAmount: 5000.0,
    installmentsCount: 10,
    startMonth: '2026-06', // 2026-09 é a parcela 4/10 (R$ 500/mês)
    creditCardId: 'card_nubank',
    categoryId: 'cat_casa',
    createdAt: '2026-06-10T15:00:00.000Z',
  },
  {
    id: 'inst_celular_manoela',
    description: 'Celular Novo (Manoela)',
    totalAmount: 3000.0,
    installmentsCount: 12,
    startMonth: '2026-08', // 2026-09 é a parcela 2/12 (R$ 250/mês)
    creditCardId: 'card_nubank',
    categoryId: 'cat_manoela',
    createdAt: '2026-08-01T12:00:00.000Z',
  },
  {
    id: 'inst_notebook_antonio',
    description: 'Notebook Trabalho (Antônio)',
    totalAmount: 4800.0,
    installmentsCount: 10,
    startMonth: '2026-02', // 2026-09 é a parcela 8/10 (R$ 480/mês) - Próxima do fim! Faltam 2!
    creditCardId: 'card_nubank',
    categoryId: 'cat_antonio',
    createdAt: '2026-02-15T18:00:00.000Z',
  },
  {
    id: 'inst_sofa_avulso',
    description: 'Sofá Retrátil Sala de Estar',
    totalAmount: 4500.0,
    installmentsCount: 6,
    startMonth: '2026-05', // 2026-09 é a parcela 5/6 (R$ 750/mês) - Próxima do fim! Falta 1!
    categoryId: 'cat_casa',
    statusByMonth: {
      '2026-09': 'pendente',
    },
    createdAt: '2026-05-20T11:00:00.000Z',
  },
];

/**
 * Despesas avulsas no cartão para Setembro 2026
 * Somadas às parcelas no cartão:
 * 500 (TV) + 250 (Celular) + 480 (Notebook) = 1.230 de parcelas
 * + 820 (Mercado) + 290 (Restaurante) + 180 (Farmácia) + 320 (Combustível) = 1.610
 * Total fatura = R$ 2.840,00! (Exatamente como solicitado no exemplo do usuário)
 */
const DEFAULT_CARD_EXPENSES: CardSimpleExpense[] = [
  {
    id: 'cexp_mercado',
    cardId: 'card_nubank',
    description: 'Mercado Mensal (Pão de Açúcar)',
    amount: 820.0,
    month: '2026-09',
    categoryId: 'cat_mercado',
    createdAt: '2026-09-03T17:00:00.000Z',
  },
  {
    id: 'cexp_restaurante',
    cardId: 'card_nubank',
    description: 'Jantar Comemoração Casal',
    amount: 290.0,
    month: '2026-09',
    categoryId: 'cat_lazer',
    createdAt: '2026-09-06T21:00:00.000Z',
  },
  {
    id: 'cexp_farmacia',
    cardId: 'card_nubank',
    description: 'Farmácia & Vitaminas',
    amount: 180.0,
    month: '2026-09',
    categoryId: 'cat_saude',
    createdAt: '2026-09-08T16:00:00.000Z',
  },
  {
    id: 'cexp_combustivel',
    cardId: 'card_nubank',
    description: 'Combustível & Estacionamento',
    amount: 320.0,
    month: '2026-09',
    categoryId: 'cat_transporte',
    createdAt: '2026-09-10T09:00:00.000Z',
  },
];

const DEFAULT_CARD_INVOICES: CreditCardMonthlyInvoice[] = [
  {
    id: 'inv_nubank_2026-09',
    cardId: 'card_nubank',
    month: '2026-09',
    status: 'pendente',
  },
];

/**
 * Inicializa ou carrega a loja de dados local isolada
 */
export function loadFinanceStore(): FinanceDataStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.categories)) {
        return parsed as FinanceDataStore;
      }
    }
  } catch (err) {
    console.error('Erro ao ler localStorage do financeiro:', err);
  }

  // Se não existir, salva e retorna os dados padrão
  const initialStore: FinanceDataStore = {
    categories: DEFAULT_CATEGORIES,
    creditCards: DEFAULT_CARDS,
    simpleAccounts: DEFAULT_SIMPLE_ACCOUNTS,
    recurringDefinitions: DEFAULT_RECURRING_DEFINITIONS,
    recurringMonthlyRecords: DEFAULT_RECURRING_RECORDS,
    installmentPurchases: DEFAULT_INSTALLMENTS,
    cardExpenses: DEFAULT_CARD_EXPENSES,
    cardMonthlyInvoices: DEFAULT_CARD_INVOICES,
  };

  saveFinanceStore(initialStore);
  return initialStore;
}

/**
 * Salva a loja de dados local
 */
export function saveFinanceStore(store: FinanceDataStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (err) {
    console.error('Erro ao salvar no localStorage:', err);
  }
}

/**
 * Reseta dados para o padrão de demonstração
 */
export function resetFinanceStore(): FinanceDataStore {
  const initialStore: FinanceDataStore = {
    categories: DEFAULT_CATEGORIES,
    creditCards: DEFAULT_CARDS,
    simpleAccounts: DEFAULT_SIMPLE_ACCOUNTS,
    recurringDefinitions: DEFAULT_RECURRING_DEFINITIONS,
    recurringMonthlyRecords: DEFAULT_RECURRING_RECORDS,
    installmentPurchases: DEFAULT_INSTALLMENTS,
    cardExpenses: DEFAULT_CARD_EXPENSES,
    cardMonthlyInvoices: DEFAULT_CARD_INVOICES,
  };
  saveFinanceStore(initialStore);
  return initialStore;
}
