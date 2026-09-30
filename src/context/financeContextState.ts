import { createContext, useContext } from 'react';
import type { FinanceDataStore } from '../domain/financeRules';
import type { Category, CreditCard, MonthFinancialSummary, UnifiedMonthlyAccount } from '../types/finance';
export interface FinanceContextType {
  apiErrorStatus?: number;
  submitFinancialCommand?: (action: string, data?: object, month?: string) => Promise<boolean>;
  mode?: 'local' | 'neon';
  loading?: boolean;
  busy?: boolean;
  ready?: boolean;
  hasCurrentView?: boolean;
  refresh?: () => void;
  createCreditCard?: (name: string) => Promise<boolean>;
  installmentAction?: (id: string, action: 'cancel' | 'payoff', reason: string) => Promise<boolean>;
  currentMonth: string;
  setCurrentMonth: (month: string) => void;
  activeTab: 'dashboard' | 'accounts' | 'history';
  setActiveTab: (tab: 'dashboard' | 'accounts' | 'history') => void;
  isSettingsOpen: boolean;
  setIsSettingsOpen: (open: boolean) => void;

  store: FinanceDataStore;
  monthlyAccounts: UnifiedMonthlyAccount[];
  financialSummary: MonthFinancialSummary;
  categories: Category[];
  creditCards: CreditCard[];

  // Operações de Contas
  toggleAccountStatus: (account: UnifiedMonthlyAccount) => void | boolean | Promise<boolean>;
  editValueAndPay: (account: UnifiedMonthlyAccount) => void;
  updateAccountValueAndDetails: (
    account: UnifiedMonthlyAccount,
    newName: string,
    newValue: number,
    newCategoryId?: string,
    extra?: {
      installmentsCount?: number;
      currentInstallment?: number;
      startMonth?: string;
      creditCardId?: string;
      operation?: 'change' | 'correct';
      reason?: string;
    }
  ) => void | boolean | Promise<boolean>;
  deleteAccount: (account: UnifiedMonthlyAccount) => void | boolean | Promise<boolean>;

  // Criações
  createSimpleAccount: (data: {
    name: string;
    value: number;
    categoryId?: string;
    month?: string;
  }) => void | boolean | Promise<boolean>;
  createRecurringAccount: (data: {
    name: string;
    initialValue: number;
    categoryId?: string;
    startMonth?: string;
  }) => void | boolean | Promise<boolean>;
  createInstallmentPurchase: (data: {
    description: string;
    totalAmount: number;
    installmentsCount: number;
    startMonth?: string;
    creditCardId?: string;
    categoryId?: string;
  }) => void | boolean | Promise<boolean>;
  createCardExpense: (data: {
    cardId: string;
    description: string;
    amount: number;
    month?: string;
    categoryId?: string;
  }) => void | boolean | Promise<boolean>;
  deleteCardItem: (sourceType: 'simple_expense' | 'installment', sourceId: string) => void | boolean | Promise<boolean>;
  updateCardExpense: (
    expenseId: string,
    data: { description: string; amount: number; categoryId?: string }
  ) => void | boolean | Promise<boolean>;
  updateInstallmentPurchase: (
    purchaseId: string,
    data: {
      description: string;
      totalAmount: number;
      installmentsCount: number;
      currentInstallment?: number;
      startMonth?: string;
      categoryId?: string;
      creditCardId?: string;
      operation?: 'change' | 'correct';
      reason?: string;
    }
  ) => void | boolean | Promise<boolean>;

  // Gerenciamento de Categorias
  addCategory: (name: string, color: string, description?: string) => void | boolean | Promise<boolean>;
  updateCategory: (category: Category) => void | boolean | Promise<boolean>;
  deleteCategory: (categoryId: string) => void | boolean | Promise<boolean>;

  // Modais de Criação e Edição de Contas
  isAccountModalOpen: boolean;
  setIsAccountModalOpen: (open: boolean) => void;
  editingAccount: UnifiedMonthlyAccount | null;
  setEditingAccount: (account: UnifiedMonthlyAccount | null) => void;
  openCreateAccountModal: () => void;
  openEditAccountModal: (account: UnifiedMonthlyAccount) => void;
  closeAccountModal: () => void;

  paymentRequest: { account: UnifiedMonthlyAccount; month: string } | null;
  cancelPayment: () => void;
  confirmPayment: (amount: number) => boolean | Promise<boolean>;
  closeCurrentMonth: () => boolean | Promise<boolean>;
  reopenCurrentMonth: () => boolean | Promise<boolean>;
  operationError: string;
  clearOperationError: () => void;
  // Utilitários
  resetData: () => void;
}

export const FinanceContext = createContext<FinanceContextType | undefined>(undefined);


export function useFinance() {
  const context = useContext(FinanceContext);
  if (!context) throw new Error("FinanceProvider required");
  return context;
}
