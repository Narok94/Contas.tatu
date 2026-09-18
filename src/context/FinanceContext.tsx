import { assertMonthOpen, assertFinancialMutation, closeMonth, reopenMonth, recordPayment } from '../domain/monthOperations';
import React, { createContext, useContext, useState, useMemo, useRef } from 'react';
import {
  applyInstallmentUpdate,
  computeFinancialSummary,
  computeOperationalMonthlyAccounts,
  FinanceDataStore,
} from '../domain/financeRules';
import {
  loadFinanceStore,
  resetFinanceStore,
  saveFinanceStore,
} from '../services/financeStorage';
import {
  AccountType,
  CardSimpleExpense,
  Category,
  CreditCard,
  InstallmentPurchase,
  MonthFinancialSummary,
  RecurringAccountDefinition,
  RecurringAccountMonthlyRecord,
  SimpleAccount,
  UnifiedMonthlyAccount,
} from '../types/finance';
import { getCurrentMonth } from '../utils/formatters';

interface FinanceContextType {
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
  toggleAccountStatus: (account: UnifiedMonthlyAccount) => void;
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
    }
  ) => void;
  deleteAccount: (account: UnifiedMonthlyAccount) => void;

  // Criações
  createSimpleAccount: (data: {
    name: string;
    value: number;
    categoryId?: string;
    month?: string;
  }) => void;
  createRecurringAccount: (data: {
    name: string;
    initialValue: number;
    categoryId?: string;
    startMonth?: string;
  }) => void;
  createInstallmentPurchase: (data: {
    description: string;
    totalAmount: number;
    installmentsCount: number;
    startMonth?: string;
    creditCardId?: string;
    categoryId?: string;
  }) => void;
  createCardExpense: (data: {
    cardId: string;
    description: string;
    amount: number;
    month?: string;
    categoryId?: string;
  }) => void;
  deleteCardItem: (sourceType: 'simple_expense' | 'installment', sourceId: string) => void;
  updateCardExpense: (
    expenseId: string,
    data: { description: string; amount: number; categoryId?: string }
  ) => void;
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
    }
  ) => void;
  paySpecificCardInvoice: (cardId: string, month: string) => void;

  // Gerenciamento de Categorias
  addCategory: (name: string, color: string, description?: string) => void;
  updateCategory: (category: Category) => void;
  deleteCategory: (categoryId: string) => void;

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
  confirmPayment: (amount: number) => boolean;
  closeCurrentMonth: () => boolean;
  reopenCurrentMonth: () => boolean;
  operationError: string;
  clearOperationError: () => void;
  // Utilitários
  resetData: () => void;
}

const FinanceContext = createContext<FinanceContextType | undefined>(undefined);

export const FinanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentMonth, setCurrentMonth] = useState<string>(() => getCurrentMonth());
  const [activeTab, setActiveTab] = useState<'dashboard' | 'accounts' | 'history'>('dashboard');
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState<boolean>(false);
  const [editingAccount, setEditingAccount] = useState<UnifiedMonthlyAccount | null>(null);
  const [store, setStoreState] = useState<FinanceDataStore>(() => loadFinanceStore());

  const storeRef = useRef(store);
  const [operationError, setOperationError] = useState('');
  const [paymentRequest, setPaymentRequest] = useState<{ account: UnifiedMonthlyAccount; month: string } | null>(null);
  const paymentRef = useRef(paymentRequest);
  const commit = (update: (previous: FinanceDataStore) => FinanceDataStore, month = currentMonth) => {
    try {
      assertMonthOpen(storeRef.current, month);
      const next = update(storeRef.current);
      assertFinancialMutation(storeRef.current, next);
      saveFinanceStore(next);
      storeRef.current = next;
      setStoreState(next);
      setOperationError('');
      return true;
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : 'Não foi possível salvar. Tente novamente.');
      return false;
    }
  };
  const setStore = (update: FinanceDataStore | ((previous: FinanceDataStore) => FinanceDataStore)) => commit(previous => typeof update === 'function' ? update(previous) : update);
  const requestPayment = (account: UnifiedMonthlyAccount, month: string) => {
    try { assertMonthOpen(storeRef.current, month); } catch (error) { setOperationError((error as Error).message); return; }
    paymentRef.current = { account, month };
    setPaymentRequest(paymentRef.current);
  };
  const cancelPayment = () => { paymentRef.current = null; setPaymentRequest(null); };
  const confirmPayment = (amount: number) => {
    const request = paymentRef.current;
    if (!request) return false;
    const success = commit(previous => recordPayment(previous, request.month, request.account.id, request.account.type, 'pago', amount), request.month);
    if (success) cancelPayment();
    return success;
  };
  const closeCurrentMonth = () => commit(previous => closeMonth(previous, currentMonth));
  // Only this explicit command may remove a current closure; it archives it first.
  const reopenCurrentMonth = () => {
    try {
      const next = reopenMonth(storeRef.current, currentMonth);
      saveFinanceStore(next);
      storeRef.current = next;
      setStoreState(next);
      setOperationError('');
      return true;
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : 'Não foi possível reabrir o mês.');
      return false;
    }
  };

  const openCreateAccountModal = () => {
    if (storeRef.current.closedMonths?.[currentMonth]) { setOperationError('Este mês está fechado. Novos lançamentos estão bloqueados.'); return; }
    setEditingAccount(null);
    setIsAccountModalOpen(true);
  };

  const openEditAccountModal = (account: UnifiedMonthlyAccount) => {
    if (storeRef.current.closedMonths?.[currentMonth]) { setOperationError('Este mês está fechado. Edições estão bloqueadas para preservar o histórico.'); return; }
    setEditingAccount(account);
    setIsAccountModalOpen(true);
  };

  const closeAccountModal = () => {
    setIsAccountModalOpen(false);
    setEditingAccount(null);
  };

  // Contas unificadas do mês corrente
  const monthlyAccounts = useMemo(() => {
    return computeOperationalMonthlyAccounts(currentMonth, store);
  }, [currentMonth, store]);

  // Resumo financeiro do mês corrente
  const financialSummary = useMemo(() => {
    const summary = computeFinancialSummary(currentMonth, store);
    const previousPendingCardsTotal = monthlyAccounts.reduce((sum, account) => sum + (account.cardInfo?.previousPendingAmount ?? 0), 0);
    return { ...summary, previousPendingCardsTotal, totalOpenWithPreviousPending: summary.totalPending + previousPendingCardsTotal };
  }, [currentMonth, store, monthlyAccounts]);

  const toggleAccountStatus = (account: UnifiedMonthlyAccount) => {
    const status = account.status === 'pendente' ? 'pago' : 'pendente';
    commit(previous => recordPayment(previous, currentMonth, account.id, account.type, status));
  };
  const editValueAndPay = (account: UnifiedMonthlyAccount) => {
    if (account.type !== 'credit_card' && account.status === 'pendente') requestPayment(account, currentMonth);
  };

  // Atualizar valor e detalhes de uma conta
  const updateAccountValueAndDetails = (
    account: UnifiedMonthlyAccount,
    newName: string,
    newValue: number,
    newCategoryId?: string,
    extra?: {
      installmentsCount?: number;
      currentInstallment?: number;
      startMonth?: string;
      creditCardId?: string;
    }
  ) => {
    setStore((prev) => {
      if (account.type === 'simple') {
        const updated = prev.simpleAccounts.map((item) =>
          item.id === account.id
            ? {
                ...item,
                name: newName,
                value: newValue,
                categoryId: newCategoryId,
              }
            : item
        );
        return { ...prev, simpleAccounts: updated };
      }

      if (account.type === 'recurring') {
        const defId = account.recurringInfo?.definitionId || account.id;
        // Atualiza a definição (nome e categoria padrão)
        const updatedDefs = prev.recurringDefinitions.map((d) =>
          d.id === defId ? { ...d, name: newName, categoryId: newCategoryId } : d
        );

        // Atualiza o registro mensal com o novo valor informado
        const existingIdx = prev.recurringMonthlyRecords.findIndex(
          (r) => r.definitionId === defId && r.month === currentMonth
        );

        let updatedRecords = [...prev.recurringMonthlyRecords];
        if (existingIdx >= 0) {
          updatedRecords[existingIdx] = {
            ...updatedRecords[existingIdx],
            value: newValue,
            isValueSet: true,
          };
        } else {
          updatedRecords.push({
            id: `rec_rec_${defId}_${currentMonth}`,
            definitionId: defId,
            month: currentMonth,
            value: newValue,
            isValueSet: true,
            status: account.status,
          });
        }

        return {
          ...prev,
          recurringDefinitions: updatedDefs,
          recurringMonthlyRecords: updatedRecords,
        };
      }

      if (account.type === 'installment') {
        const purchaseId = account.installmentInfo?.purchaseId || account.id;
        const count = extra?.installmentsCount || account.installmentInfo?.totalInstallments || 1;
        const total = extra?.installmentsCount
          ? newValue
          : account.installmentInfo
          ? newValue * account.installmentInfo.totalInstallments
          : newValue;

        const currentInst =
          typeof extra?.currentInstallment === 'number' && extra.currentInstallment >= 1
            ? extra.currentInstallment
            : account.installmentInfo?.currentInstallment || 1;

        const updatedPurchases = applyInstallmentUpdate(
          prev.installmentPurchases,
          purchaseId,
          currentMonth,
          {
            description: newName,
            totalAmount: total,
            installmentsCount: count,
            currentInstallment: currentInst,
            categoryId: newCategoryId,
            creditCardId:
              extra?.creditCardId !== undefined
                ? extra.creditCardId || undefined
                : undefined,
          }
        );
        return { ...prev, installmentPurchases: updatedPurchases };
      }

      if (account.type === 'credit_card') {
        const cardId = account.cardInfo?.cardId || account.id;
        const updatedCards = prev.creditCards.map((c) =>
          c.id === cardId ? { ...c, name: newName } : c
        );
        return { ...prev, creditCards: updatedCards };
      }

      return prev;
    });
  };

  // Excluir conta
  const deleteAccount = (account: UnifiedMonthlyAccount) => {
    setStore((prev) => {
      if (account.type === 'simple') {
        return {
          ...prev,
          simpleAccounts: prev.simpleAccounts.filter((i) => i.id !== account.id),
        };
      }

      if (account.type === 'recurring') {
        const defId = account.recurringInfo?.definitionId || account.id;
        return {
          ...prev,
          recurringDefinitions: prev.recurringDefinitions.filter((d) => d.id !== defId),
          recurringMonthlyRecords: prev.recurringMonthlyRecords.filter(
            (r) => r.definitionId !== defId
          ),
        };
      }

      if (account.type === 'installment') {
        const purchaseId = account.installmentInfo?.purchaseId || account.id;
        return {
          ...prev,
          installmentPurchases: prev.installmentPurchases.filter((p) => p.id !== purchaseId),
        };
      }

      if (account.type === 'credit_card') {
        const cardId = account.cardInfo?.cardId || account.id;
        return {
          ...prev,
          creditCards: prev.creditCards.filter((c) => c.id !== cardId),
          cardExpenses: prev.cardExpenses.filter((e) => e.cardId !== cardId),
          installmentPurchases: prev.installmentPurchases.map((p) =>
            p.creditCardId === cardId ? { ...p, creditCardId: undefined } : p
          ),
          cardMonthlyInvoices: prev.cardMonthlyInvoices.filter((inv) => inv.cardId !== cardId),
        };
      }

      return prev;
    });
  };

  // Criar Conta Simples
  const createSimpleAccount = ({
    name,
    value,
    categoryId,
    month = currentMonth,
  }: {
    name: string;
    value: number;
    categoryId?: string;
    month?: string;
  }) => {
    if (storeRef.current.closedMonths?.[month]) { setOperationError('O mês de destino está fechado.'); return; }
    const newSimple: SimpleAccount = {
      id: `simp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name,
      value,
      month,
      categoryId,
      status: 'pendente',
      createdAt: new Date().toISOString(),
    };
    setStore((prev) => ({
      ...prev,
      simpleAccounts: [newSimple, ...prev.simpleAccounts],
    }));
  };

  // Criar Conta Fixa / Recorrente
  const createRecurringAccount = ({
    name,
    initialValue,
    categoryId,
    startMonth = currentMonth,
  }: {
    name: string;
    initialValue: number;
    categoryId?: string;
    startMonth?: string;
  }) => {
    if (storeRef.current.closedMonths?.[startMonth]) { setOperationError('O mês de destino está fechado.'); return; }
    const defId = `rec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newDef: RecurringAccountDefinition = {
      id: defId,
      name,
      categoryId,
      startMonth,
      isActive: true,
      createdAt: new Date().toISOString(),
    };

    const initialRecord: RecurringAccountMonthlyRecord = {
      id: `rec_rec_${defId}_${startMonth}`,
      definitionId: defId,
      month: startMonth,
      value: initialValue,
      isValueSet: initialValue > 0,
      status: 'pendente',
    };

    setStore((prev) => ({
      ...prev,
      recurringDefinitions: [...prev.recurringDefinitions, newDef],
      recurringMonthlyRecords: [...prev.recurringMonthlyRecords, initialRecord],
    }));
  };

  // Criar Compra Parcelada
  const createInstallmentPurchase = ({
    description,
    totalAmount,
    installmentsCount,
    startMonth = currentMonth,
    creditCardId,
    categoryId,
  }: {
    description: string;
    totalAmount: number;
    installmentsCount: number;
    startMonth?: string;
    creditCardId?: string;
    categoryId?: string;
  }) => {
    if (storeRef.current.closedMonths?.[startMonth]) { setOperationError('O mês de destino está fechado.'); return; }
    const newPurchase: InstallmentPurchase = {
      id: `inst_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      description,
      totalAmount,
      installmentsCount,
      startMonth,
      creditCardId: creditCardId || undefined,
      categoryId,
      statusByMonth: {
        [startMonth]: 'pendente',
      },
      createdAt: new Date().toISOString(),
    };

    setStore((prev) => ({
      ...prev,
      installmentPurchases: [...prev.installmentPurchases, newPurchase],
    }));
  };

  // Criar despesa avulsa no Cartão
  const createCardExpense = ({
    cardId,
    description,
    amount,
    month = currentMonth,
    categoryId,
  }: {
    cardId: string;
    description: string;
    amount: number;
    month?: string;
    categoryId?: string;
  }) => {
    if (storeRef.current.closedMonths?.[month]) { setOperationError('O mês de destino está fechado.'); return; }
    const newExpense: CardSimpleExpense = {
      id: `cexp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      cardId,
      description,
      amount,
      month,
      categoryId,
      createdAt: new Date().toISOString(),
    };

    setStore((prev) => ({
      ...prev,
      cardExpenses: [...prev.cardExpenses, newExpense],
    }));
  };

  // Excluir item de dentro do Cartão
  const deleteCardItem = (sourceType: 'simple_expense' | 'installment', sourceId: string) => {
    setStore((prev) => {
      if (sourceType === 'simple_expense') {
        return {
          ...prev,
          cardExpenses: prev.cardExpenses.filter((e) => e.id !== sourceId),
        };
      }
      if (sourceType === 'installment') {
        return {
          ...prev,
          installmentPurchases: prev.installmentPurchases.filter((p) => p.id !== sourceId),
        };
      }
      return prev;
    });
  };

  // Atualizar Compra Parcelada (avulsa ou no cartão) com preservação de histórico
  const updateInstallmentPurchase = (
    purchaseId: string,
    data: {
      description: string;
      totalAmount: number;
      installmentsCount: number;
      currentInstallment?: number;
      startMonth?: string;
      categoryId?: string;
      creditCardId?: string;
    }
  ) => {
    setStore((prev) => ({
      ...prev,
      installmentPurchases: applyInstallmentUpdate(
        prev.installmentPurchases,
        purchaseId,
        currentMonth,
        data
      ),
    }));
  };

  const paySpecificCardInvoice = (cardId: string, month: string) => {
    commit(previous => recordPayment(previous, month, cardId, 'credit_card', 'pago'), month);
  };

  // Atualizar despesa simples no cartão
  const updateCardExpense = (
    expenseId: string,
    data: {
      description: string;
      amount: number;
      categoryId?: string;
    }
  ) => {
    setStore((prev) => ({
      ...prev,
      cardExpenses: prev.cardExpenses.map((e) =>
        e.id === expenseId
          ? {
              ...e,
              description: data.description.trim(),
              amount: data.amount,
              categoryId: data.categoryId,
            }
          : e
      ),
    }));
  };

  // Gerenciamento de Categorias
  const addCategory = (name: string, color: string, description?: string) => {
    const newCat: Category = {
      id: `cat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name,
      color,
      description,
    };
    setStore((prev) => ({
      ...prev,
      categories: [...prev.categories, newCat],
    }));
  };

  const updateCategory = (updated: Category) => {
    setStore((prev) => ({
      ...prev,
      categories: prev.categories.map((c) => (c.id === updated.id ? updated : c)),
    }));
  };

  const deleteCategory = (categoryId: string) => {
    setStore((prev) => ({
      ...prev,
      categories: prev.categories.filter((c) => c.id !== categoryId),
      // Remove a categoria de simples, recorrentes e parcelas
      simpleAccounts: prev.simpleAccounts.map((a) =>
        a.categoryId === categoryId ? { ...a, categoryId: undefined } : a
      ),
      recurringDefinitions: prev.recurringDefinitions.map((d) =>
        d.categoryId === categoryId ? { ...d, categoryId: undefined } : d
      ),
      installmentPurchases: prev.installmentPurchases.map((p) =>
        p.categoryId === categoryId ? { ...p, categoryId: undefined } : p
      ),
      cardExpenses: prev.cardExpenses.map((e) =>
        e.categoryId === categoryId ? { ...e, categoryId: undefined } : e
      ),
    }));
  };

  // Resetar dados para o padrão
  const resetData = () => {
    if (Object.keys(storeRef.current.closedMonths ?? {}).length || Object.keys(storeRef.current.closedMonthHistory ?? {}).length) {
      setOperationError('Há meses fechados. A restauração de demonstração está bloqueada para preservar o histórico.');
      return;
    }
    const fresh = resetFinanceStore();
    setStore(fresh);
  };

  return (
    <FinanceContext.Provider
      value={{
        editValueAndPay,
        paymentRequest, cancelPayment, confirmPayment, closeCurrentMonth, reopenCurrentMonth, operationError, clearOperationError: () => setOperationError(''),
        currentMonth,
        setCurrentMonth,
        activeTab,
        setActiveTab,
        isSettingsOpen,
        setIsSettingsOpen,
        isAccountModalOpen,
        setIsAccountModalOpen,
        editingAccount,
        setEditingAccount,
        openCreateAccountModal,
        openEditAccountModal,
        closeAccountModal,
        store,
        monthlyAccounts,
        financialSummary,
        categories: store.categories,
        creditCards: store.creditCards,
        toggleAccountStatus,
        updateAccountValueAndDetails,
        deleteAccount,
        createSimpleAccount,
        createRecurringAccount,
        createInstallmentPurchase,
        createCardExpense,
        deleteCardItem,
        updateCardExpense,
        updateInstallmentPurchase,
        paySpecificCardInvoice,
        addCategory,
        updateCategory,
        deleteCategory,
        resetData,
      }}
    >
      {children}
    </FinanceContext.Provider>
  );
};

export function useFinance() {
  const context = useContext(FinanceContext);
  if (!context) {
    throw new Error('useFinance must be used within a FinanceProvider');
  }
  return context;
}
