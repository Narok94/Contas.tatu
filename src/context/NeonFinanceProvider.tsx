import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { FinanceContext, type FinanceContextType } from './financeContextState';
import { ApiError, FinanceSession } from '../services/financeApi';
import { computeFinancialSummary, computeOperationalMonthlyAccounts, type FinanceDataStore } from '../domain/financeRules';
import { getCurrentMonth } from '../utils/formatters';
import type { UnifiedMonthlyAccount } from '../types/finance';

const empty: FinanceDataStore = { categories: [], creditCards: [], simpleAccounts: [], recurringDefinitions: [],
  recurringMonthlyRecords: [], installmentPurchases: [], cardExpenses: [], cardMonthlyInvoices: [] };
const accountId = (a: UnifiedMonthlyAccount) => a.recurringInfo?.definitionId ?? a.installmentInfo?.purchaseId ?? a.cardInfo?.cardId ?? a.id;

export function NeonFinanceProvider({ children }: { children: React.ReactNode }) {
  const [session] = useState(() => new FinanceSession(getCurrentMonth()));
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const [activeTab, setActiveTab] = useState<FinanceContextType['activeTab']>('dashboard');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<UnifiedMonthlyAccount | null>(null);
  const [paymentRequest, setPaymentRequest] = useState<FinanceContextType['paymentRequest']>(null);
  useEffect(() => { void session.load(); }, [session]);
  const store = state.view?.state ?? empty;
  const currentMonth = state.month;
  const command = session.command;
  const updateInstallmentPurchase: FinanceContextType['updateInstallmentPurchase'] = (id, data) => {
    const { startMonth: _ignored, operation = 'change', reason = 'Alteração solicitada no aplicativo', ...fields } = data;
    return command(`installment.${operation}`, { id, ...fields, currentInstallment: data.currentInstallment ?? 1, reason });
  };
  const installmentAction = async (id: string, action: 'cancel' | 'payoff', reason: string) => {
    if (action === 'cancel') return command('installment.cancel', { id, reason });
    // Quote and command share the revision; concurrent changes produce a conflict, never an outdated payoff.
    return session.mutate(async revision => {
      const month = session.snapshot.month;
      const quote = await session.api.quote(month, id);
      if (quote.revision !== revision) throw new ApiError(409);
      return session.api.command('installment.payoff', month, revision, { id, reason, amount: quote.amount });
    });
  };
  const remove = (a: UnifiedMonthlyAccount) => a.type === 'installment'
    ? installmentAction(accountId(a), 'cancel', 'Cancelamento a partir do mês selecionado')
    : command(`${a.type === 'credit_card' ? 'card' : a.type}.archive`, { id: accountId(a) });
  const value: FinanceContextType = {
    submitFinancialCommand: command, apiErrorStatus: state.errorStatus,
    mode: 'neon', loading: state.loading, busy: state.busy, ready: state.ready, hasCurrentView: state.view?.month === state.month,
    refresh: () => { session.clearError(); void session.load(); },
    currentMonth, setCurrentMonth: month => { if (!state.busy) { setPaymentRequest(null); void session.load(month); } },
    activeTab, setActiveTab, isSettingsOpen, setIsSettingsOpen,
    store, monthlyAccounts: computeOperationalMonthlyAccounts(currentMonth, store), financialSummary: computeFinancialSummary(currentMonth, store),
    categories: store.categories, creditCards: store.creditCards,
    isAccountModalOpen, setIsAccountModalOpen, editingAccount, setEditingAccount,
    openCreateAccountModal: () => { if (state.ready && !state.busy) { setEditingAccount(null); setIsAccountModalOpen(true); } },
    openEditAccountModal: account => { if (state.ready && !state.busy) { setEditingAccount(account); setIsAccountModalOpen(true); } },
    closeAccountModal: () => { setIsAccountModalOpen(false); setEditingAccount(null); },
    paymentRequest, cancelPayment: () => setPaymentRequest(null),
    confirmPayment: async amount => {
      if (!paymentRequest) return false;
      const { account, month } = paymentRequest;
      const ok = await command('payment', { id: accountId(account), type: account.type, status: account.type === 'credit_card' ? 'parcial' : 'pago', amount }, month);
      if (ok) setPaymentRequest(null); return ok;
    },
    toggleAccountStatus: a => command('payment', { id: accountId(a), type: a.type, status: a.status === 'pago' ? 'pendente' : 'pago' }),
    editValueAndPay: account => { if (state.ready && !state.busy) setPaymentRequest({ account, month: currentMonth }); },
    closeCurrentMonth: () => command('month.close'), reopenCurrentMonth: () => command('month.reopen'),
    createSimpleAccount: ({ month = currentMonth, ...data }) => command('simple.create', data, month),
    createRecurringAccount: ({ startMonth = currentMonth, ...data }) => command('recurring.create', data, startMonth),
    createInstallmentPurchase: ({ startMonth = currentMonth, ...data }) => command('installment.create', data, startMonth),
    createCardExpense: ({ month = currentMonth, ...data }) => command('expense.create', data, month),
    createCreditCard: name => command('card.create', { name }),
    updateAccountValueAndDetails: (a, name, amount, categoryId, extra) => {
      const id = accountId(a);
      if (a.type === 'credit_card') return command('card.edit', { id, name });
      if (a.type === 'installment') return updateInstallmentPurchase(id, { description: name,
        totalAmount: extra?.installmentsCount ? amount : amount * (a.installmentInfo?.totalInstallments ?? 1),
        installmentsCount: extra?.installmentsCount ?? a.installmentInfo?.totalInstallments ?? 1,
        currentInstallment: extra?.currentInstallment ?? a.installmentInfo?.currentInstallment ?? 1,
        categoryId, creditCardId: extra?.creditCardId, operation: extra?.operation, reason: extra?.reason });
      return command(`${a.type}.edit`, { id, name, value: amount, categoryId });
    },
    deleteAccount: remove,
    deleteCardItem: (type, id) => type === 'installment' ? installmentAction(id, 'cancel', 'Cancelamento a partir do mês selecionado') : command('expense.archive', { id }),
    updateCardExpense: (id, data) => command('expense.edit', { id, ...data }),
    updateInstallmentPurchase, installmentAction,
    addCategory: (name, color, description) => session.category('POST', undefined, { name, color, description }),
    updateCategory: ({ id, name, color, description }) => session.category('PATCH', id, { name, color, description }),
    deleteCategory: id => session.category('DELETE', id),
    operationError: state.error, clearOperationError: session.clearError,
    // No demo reset or local data import in API mode.
    resetData: () => {},
  };
  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}
