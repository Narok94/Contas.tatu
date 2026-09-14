import React, { useState, useMemo } from 'react';
import {
  Plus,
  Filter,
  CheckCircle2,
  Circle,
  Layers,
  CreditCard as CardIcon,
  Repeat,
  FileText,
  Sparkles,
} from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { UnifiedMonthlyAccount } from '../types/finance';
import { AccountCard } from '../components/AccountCard';
import { CreditCardAccountCard, CardInternalItem } from '../components/CreditCardAccountCard';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { AccountModal } from '../components/AccountModal';
import { CardPurchaseModal } from '../components/CardPurchaseModal';
import { formatBRL, formatMonthYear } from '../utils/formatters';

type StatusFilterType = 'all' | 'pendente' | 'pago';
type AccountTypeFilter = 'all' | 'simple' | 'recurring' | 'installment' | 'credit_card';

export const AccountsPage: React.FC = () => {
  const {
    currentMonth,
    monthlyAccounts,
    financialSummary,
    toggleAccountStatus,
    deleteAccount,
    deleteCardItem,
    isAccountModalOpen,
    editingAccount,
    openCreateAccountModal,
    openEditAccountModal,
    closeAccountModal,
  } = useFinance();

  // Bloco 1 - Filtro de Status
  const [statusFilter, setStatusFilter] = useState<StatusFilterType>('all');

  // Bloco 2 - Filtro de Tipo de Conta
  const [typeFilter, setTypeFilter] = useState<AccountTypeFilter>('all');

  // Modal para adicionar ou editar compra interna no cartão
  const [cardPurchaseModalCardId, setCardPurchaseModalCardId] = useState<string | null>(null);
  const [editingCardItem, setEditingCardItem] = useState<{
    cardId: string;
    item: CardInternalItem;
  } | null>(null);

  // Diálogo de confirmação de exclusão
  const [accountToDelete, setAccountToDelete] = useState<UnifiedMonthlyAccount | null>(null);
  const [cardItemToDelete, setCardItemToDelete] = useState<{
    sourceType: 'simple_expense' | 'installment';
    sourceId: string;
    description: string;
  } | null>(null);

  // Filtragem combinada
  const filteredAccounts = useMemo(() => {
    return monthlyAccounts.filter((acc) => {
      // Bloco 1: Status
      if (statusFilter !== 'all' && acc.status !== statusFilter) {
        return false;
      }
      // Bloco 2: Tipo de Conta
      if (typeFilter !== 'all' && acc.type !== typeFilter) {
        return false;
      }
      return true;
    });
  }, [monthlyAccounts, statusFilter, typeFilter]);

  // Contadores para o resumo e badges
  const paidCount = monthlyAccounts.filter((a) => a.status === 'pago').length;
  const pendingCount = monthlyAccounts.filter((a) => a.status === 'pendente').length;

  const typeCounts = useMemo(() => {
    return {
      simple: monthlyAccounts.filter((a) => a.type === 'simple').length,
      recurring: monthlyAccounts.filter((a) => a.type === 'recurring').length,
      installment: monthlyAccounts.filter((a) => a.type === 'installment').length,
      credit_card: monthlyAccounts.filter((a) => a.type === 'credit_card').length,
    };
  }, [monthlyAccounts]);

  const handleConfirmDeleteAccount = () => {
    if (accountToDelete) {
      deleteAccount(accountToDelete);
      setAccountToDelete(null);
    }
  };

  const handleConfirmDeleteCardItem = () => {
    if (cardItemToDelete) {
      deleteCardItem(cardItemToDelete.sourceType, cardItemToDelete.sourceId);
      setCardItemToDelete(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-6 space-y-5">
      {/* Top Bar: Title, Context, Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E7E2D8] pb-4">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-stone-500 tracking-wide">
            <span>Contas e despesas</span>
            <span>•</span>
            <span>{monthlyAccounts.length} {monthlyAccounts.length === 1 ? 'item no mês' : 'itens no mês'}</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-stone-900 capitalize mt-0.5">
            Contas de {formatMonthYear(currentMonth)}
          </h2>
        </div>

        <button
          id="btn-new-account"
          type="button"
          onClick={openCreateAccountModal}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#9E432A] hover:bg-[#88361F] text-white text-xs font-semibold rounded-xl shadow-2xs hover:shadow-xs transition-all cursor-pointer shrink-0 self-start sm:self-auto active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" />
          <span>Nova Conta</span>
        </button>
      </div>

      {/* Financial Summary Bar: Total previsto, Pendente, Pago integrado */}
      <div className="bg-white border border-[#E2DDD3] rounded-2xl shadow-sm overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[#EAE5DC]">
          {/* Total Previsto */}
          <div className="p-4 sm:p-5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wider">
                Total Previsto
              </span>
              <span className="text-[11px] font-semibold text-stone-600 bg-stone-100 px-2 py-0.5 rounded-full">
                {monthlyAccounts.length} {monthlyAccounts.length === 1 ? 'conta' : 'contas'}
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-stone-900 pt-0.5">
              {formatBRL(financialSummary.totalExpected)}
            </div>
            <span className="text-xs text-stone-500 block">
              Previsão de despesas deste mês
            </span>
          </div>

          {/* Pendente */}
          <div
            className={`p-4 sm:p-5 space-y-1.5 transition-colors ${
              pendingCount > 0 ? 'bg-[#FDFCF9]' : ''
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-amber-900 uppercase tracking-wider">
                Ainda Pendente
              </span>
              <span className="text-[11px] font-bold text-amber-800 bg-amber-100/90 px-2 py-0.5 rounded-full border border-amber-200/70">
                {pendingCount} a pagar
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-amber-950 pt-0.5">
              {formatBRL(financialSummary.totalPending)}
            </div>
            {financialSummary.previousPendingCardsTotal > 0 ? (
              <span className="text-xs font-semibold text-amber-900 block">
                + {formatBRL(financialSummary.previousPendingCardsTotal)} em faturas anteriores
              </span>
            ) : (
              <span className="text-xs text-stone-500 block">
                {pendingCount === 0 ? 'Tudo quitado para este mês' : 'Aguardando pagamento'}
              </span>
            )}
          </div>

          {/* Já Pago */}
          <div className="p-4 sm:p-5 space-y-1.5 bg-[#F8FAF8]">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-emerald-900 uppercase tracking-wider">
                Total Pago
              </span>
              <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100/90 px-2 py-0.5 rounded-full border border-emerald-200/80">
                {paidCount} quitadas
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-emerald-900 pt-0.5">
              {formatBRL(financialSummary.totalPaid)}
            </div>
            {/* Barra de progresso */}
            <div className="pt-1">
              <div className="w-full bg-stone-200/70 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-emerald-600 h-1.5 rounded-full transition-all duration-500"
                  style={{
                    width: `${
                      financialSummary.totalExpected > 0
                        ? Math.min(
                            100,
                            Math.round(
                              (financialSummary.totalPaid / financialSummary.totalExpected) * 100
                            )
                          )
                        : 0
                    }%`,
                  }}
                />
              </div>
              <div className="flex justify-between items-center text-[10px] text-stone-400 mt-1">
                <span>
                  {financialSummary.totalExpected > 0
                    ? `${Math.round(
                        (financialSummary.totalPaid / financialSummary.totalExpected) * 100
                      )}% concluído`
                    : '0%'}
                </span>
                <span className="text-emerald-800 font-semibold">{paidCount} de {monthlyAccounts.length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Control Filters Bar - Bloco 1 (Status) + Bloco 2 (Tipo de Conta) */}
      <div className="bg-white p-3.5 rounded-2xl border border-[#E2DDD3] shadow-xs space-y-2.5">
        {/* Bloco 1: Status */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wider w-16 shrink-0">
            Status:
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              id="filter-status-all"
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-[#9E432A] text-white shadow-2xs'
                  : 'bg-[#FAF8F5] text-stone-700 border border-[#E2DDD3] hover:bg-[#F2EEE7]'
              }`}
            >
              Todas ({monthlyAccounts.length})
            </button>

            <button
              id="filter-status-pending"
              type="button"
              onClick={() => setStatusFilter('pendente')}
              className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer inline-flex items-center gap-1.5 ${
                statusFilter === 'pendente'
                  ? 'bg-amber-600 text-white shadow-2xs'
                  : 'bg-amber-50 text-amber-900 border border-amber-200/80 hover:bg-amber-100/80'
              }`}
            >
              <Circle className="w-3 h-3 text-amber-600" />
              Pendentes ({pendingCount})
            </button>

            <button
              id="filter-status-paid"
              type="button"
              onClick={() => setStatusFilter('pago')}
              className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer inline-flex items-center gap-1.5 ${
                statusFilter === 'pago'
                  ? 'bg-emerald-700 text-white shadow-2xs'
                  : 'bg-emerald-50 text-emerald-900 border border-emerald-200/80 hover:bg-emerald-100/80'
              }`}
            >
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              Pagas ({paidCount})
            </button>
          </div>
        </div>

        {/* Separator */}
        <div className="border-t border-[#EAE5DC]" />

        {/* Bloco 2: Tipo de Conta */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wider w-16 shrink-0">
            Tipo:
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              id="filter-type-all"
              type="button"
              onClick={() => setTypeFilter('all')}
              className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                typeFilter === 'all'
                  ? 'bg-stone-900 text-white shadow-2xs'
                  : 'bg-[#FAF8F5] text-stone-700 border border-[#E2DDD3] hover:bg-[#F2EEE7]'
              }`}
            >
              Todos os tipos
            </button>

            <button
              id="filter-type-simple"
              type="button"
              onClick={() => setTypeFilter('simple')}
              className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer inline-flex items-center gap-1.5 ${
                typeFilter === 'simple'
                  ? 'bg-stone-900 text-white shadow-2xs'
                  : 'bg-[#FAF8F5] text-stone-700 border border-[#E2DDD3] hover:bg-[#F2EEE7]'
              }`}
            >
              <FileText className="w-3 h-3 text-stone-500" />
              Simples ({typeCounts.simple})
            </button>

            <button
              id="filter-type-recurring"
              type="button"
              onClick={() => setTypeFilter('recurring')}
              className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer inline-flex items-center gap-1.5 ${
                typeFilter === 'recurring'
                  ? 'bg-stone-900 text-white shadow-2xs'
                  : 'bg-[#FAF8F5] text-stone-700 border border-[#E2DDD3] hover:bg-[#F2EEE7]'
              }`}
            >
              <Repeat className="w-3 h-3 text-stone-500" />
              Fixas ({typeCounts.recurring})
            </button>

            <button
              id="filter-type-installment"
              type="button"
              onClick={() => setTypeFilter('installment')}
              className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer inline-flex items-center gap-1.5 ${
                typeFilter === 'installment'
                  ? 'bg-stone-900 text-white shadow-2xs'
                  : 'bg-[#FAF8F5] text-stone-700 border border-[#E2DDD3] hover:bg-[#F2EEE7]'
              }`}
            >
              <Layers className="w-3 h-3 text-stone-500" />
              Parceladas ({typeCounts.installment})
            </button>

            <button
              id="filter-type-card"
              type="button"
              onClick={() => setTypeFilter('credit_card')}
              className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer inline-flex items-center gap-1.5 ${
                typeFilter === 'credit_card'
                  ? 'bg-[#9E432A] text-white shadow-2xs'
                  : 'bg-[#FAF8F5] text-stone-700 border border-[#E2DDD3] hover:bg-[#F2EEE7]'
              }`}
            >
              <CardIcon className="w-3 h-3 text-[#9E432A]" />
              Cartões ({typeCounts.credit_card})
            </button>
          </div>
        </div>
      </div>

      {/* Grid of Accounts (approximately 3 cards per row on desktop, independent height) */}
      {filteredAccounts.length === 0 ? (
        <div className="py-14 text-center bg-white border border-stone-200 rounded-xl p-8 shadow-xs">
          <div className="w-12 h-12 rounded-full bg-stone-100 text-stone-400 mx-auto flex items-center justify-center mb-3">
            <Layers className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-stone-800">
            Nenhuma conta encontrada
          </h3>
          <p className="text-sm text-stone-500 mt-1 max-w-md mx-auto">
            Não há contas correspondentes aos filtros selecionados para este mês. Tente alternar os filtros de status ou tipo.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
          {filteredAccounts.map((account) => {
            if (account.type === 'credit_card') {
              return (
                <CreditCardAccountCard
                  key={account.id}
                  account={account}
                  onToggleStatus={toggleAccountStatus}
                  onEdit={openEditAccountModal}
                  onDelete={(acc) => setAccountToDelete(acc)}
                  onAddPurchase={(cardId) => {
                    setEditingCardItem(null);
                    setCardPurchaseModalCardId(cardId);
                  }}
                  onEditItem={(item) =>
                    setEditingCardItem({
                      cardId: account.cardInfo?.cardId || account.id,
                      item,
                    })
                  }
                  onDeleteItem={(sourceType, sourceId, description) =>
                    setCardItemToDelete({ sourceType, sourceId, description })
                  }
                />
              );
            }

            return (
              <AccountCard
                key={account.id}
                account={account}
                onToggleStatus={toggleAccountStatus}
                onEdit={openEditAccountModal}
                onDelete={(acc) => setAccountToDelete(acc)}
              />
            );
          })}
        </div>
      )}

      {/* Modal de Compra no Cartão (Criação e Edição) */}
      <CardPurchaseModal
        isOpen={Boolean(cardPurchaseModalCardId || editingCardItem)}
        onClose={() => {
          setCardPurchaseModalCardId(null);
          setEditingCardItem(null);
        }}
        cardId={cardPurchaseModalCardId || editingCardItem?.cardId || ''}
        editingItem={editingCardItem?.item}
      />

      {/* Diálogo de confirmação obrigatória para exclusão de conta */}
      <ConfirmDialog
        isOpen={Boolean(accountToDelete)}
        title="Excluir Conta"
        message="Tem certeza de que deseja excluir esta conta? Esta operação não pode ser desfeita."
        itemName={accountToDelete?.name}
        confirmLabel="Sim, excluir conta"
        onConfirm={handleConfirmDeleteAccount}
        onCancel={() => setAccountToDelete(null)}
      />

      {/* Diálogo de confirmação para exclusão de item da fatura do cartão */}
      <ConfirmDialog
        isOpen={Boolean(cardItemToDelete)}
        title="Remover Compra da Fatura"
        message="Tem certeza de que deseja remover esta compra da fatura do cartão?"
        itemName={cardItemToDelete?.description}
        confirmLabel="Sim, remover"
        onConfirm={handleConfirmDeleteCardItem}
        onCancel={() => setCardItemToDelete(null)}
      />
    </div>
  );
};
