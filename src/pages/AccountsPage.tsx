import '../accounts.css';
import React, { useState, useMemo } from 'react';
import {
  CheckCircle2,
  Circle,
  Layers,
  CreditCard as CardIcon,
  Repeat,
  FileText,
} from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { UnifiedMonthlyAccount } from '../types/finance';
import { AccountCard } from '../components/AccountCard';
import { CreditCardAccountCard, CardInternalItem } from '../components/CreditCardAccountCard';
import { ConfirmDialog } from '../components/ConfirmDialog';
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
    openEditAccountModal,
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

  // Filter creates a new array; stable sorting changes presentation only.
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
    }).sort((a, b) => Number(a.status === 'pago') - Number(b.status === 'pago'));
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
    <div className="accounts-page">
      <header className="accounts-heading">
        <h2>Contas <span>· {formatMonthYear(currentMonth)}</span></h2>
        <span>{monthlyAccounts.length} {monthlyAccounts.length === 1 ? 'conta no mês' : 'contas no mês'}</span>
      </header>

      <section className="accounts-summary" aria-label="Resumo financeiro do mês">
        <div className="accounts-total">
          <span><Layers size={15} />Total previsto</span>
          <strong>{formatBRL(financialSummary.totalExpected)}</strong>
          <small>{monthlyAccounts.length} contas no mês</small>
        </div>
        <div className="accounts-pending">
          <span><Circle size={15} />Ainda pendente</span>
          <strong>{formatBRL(financialSummary.totalPending)}</strong>
          <small>{pendingCount} a pagar{financialSummary.previousPendingCardsTotal > 0 && <> · + {formatBRL(financialSummary.previousPendingCardsTotal)} em faturas anteriores</>}</small>
        </div>
        <div className="accounts-paid">
          <span><CheckCircle2 size={15} />Total pago</span>
          <strong>{formatBRL(financialSummary.totalPaid)}</strong>
          <small>{paidCount} quitadas</small>
        </div>
      </section>

      {/* Control Filters Bar - Bloco 1 (Status) + Bloco 2 (Tipo de Conta) */}
      <div className="accounts-filters">
        {/* Bloco 1: Status */}
        <div className="accounts-filter-group">
          <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wider shrink-0">
            Status:
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              id="filter-status-all"
              aria-pressed={statusFilter === 'all'}
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-brand text-white shadow-2xs'
                  : 'bg-surface-soft text-stone-700 border border-line hover:bg-surface-muted'
              }`}
            >
              Todas ({monthlyAccounts.length})
            </button>

            <button
              id="filter-status-pending"
              aria-pressed={statusFilter === 'pendente'}
              type="button"
              onClick={() => setStatusFilter('pendente')}
              className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer inline-flex items-center gap-1.5 ${
                statusFilter === 'pendente'
                  ? 'bg-amber-700 text-white shadow-2xs'
                  : 'bg-amber-50 text-amber-900 border border-amber-200/80 hover:bg-amber-100/80'
              }`}
            >
              <Circle className="w-3 h-3" />
              Pendentes ({pendingCount})
            </button>

            <button
              id="filter-status-paid"
              aria-pressed={statusFilter === 'pago'}
              type="button"
              onClick={() => setStatusFilter('pago')}
              className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer inline-flex items-center gap-1.5 ${
                statusFilter === 'pago'
                  ? 'bg-emerald-700 text-white shadow-2xs'
                  : 'bg-emerald-50 text-emerald-900 border border-emerald-200/80 hover:bg-emerald-100/80'
              }`}
            >
              <CheckCircle2 className="w-3 h-3" />
              Pagas ({paidCount})
            </button>
          </div>
        </div>

        {/* Bloco 2: Tipo de Conta */}
        <div className="accounts-filter-group">
          <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wider shrink-0">
            Tipo:
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              id="filter-type-all"
              aria-pressed={typeFilter === 'all'}
              type="button"
              onClick={() => setTypeFilter('all')}
              className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                typeFilter === 'all'
                  ? 'bg-brand text-white shadow-2xs'
                  : 'bg-surface-soft text-stone-700 border border-line hover:bg-surface-muted'
              }`}
            >
              Todos os tipos
            </button>

            <button
              id="filter-type-simple"
              aria-pressed={typeFilter === 'simple'}
              type="button"
              onClick={() => setTypeFilter('simple')}
              className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer inline-flex items-center gap-1.5 ${
                typeFilter === 'simple'
                  ? 'bg-brand text-white shadow-2xs'
                  : 'bg-surface-soft text-stone-700 border border-line hover:bg-surface-muted'
              }`}
            >
              <FileText className="w-3 h-3" />
              Simples ({typeCounts.simple})
            </button>

            <button
              id="filter-type-recurring"
              aria-pressed={typeFilter === 'recurring'}
              type="button"
              onClick={() => setTypeFilter('recurring')}
              className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer inline-flex items-center gap-1.5 ${
                typeFilter === 'recurring'
                  ? 'bg-brand text-white shadow-2xs'
                  : 'bg-surface-soft text-stone-700 border border-line hover:bg-surface-muted'
              }`}
            >
              <Repeat className="w-3 h-3" />
              Fixas ({typeCounts.recurring})
            </button>

            <button
              id="filter-type-installment"
              aria-pressed={typeFilter === 'installment'}
              type="button"
              onClick={() => setTypeFilter('installment')}
              className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer inline-flex items-center gap-1.5 ${
                typeFilter === 'installment'
                  ? 'bg-brand text-white shadow-2xs'
                  : 'bg-surface-soft text-stone-700 border border-line hover:bg-surface-muted'
              }`}
            >
              <Layers className="w-3 h-3" />
              Parceladas ({typeCounts.installment})
            </button>

            <button
              id="filter-type-card"
              aria-pressed={typeFilter === 'credit_card'}
              type="button"
              onClick={() => setTypeFilter('credit_card')}
              className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer inline-flex items-center gap-1.5 ${
                typeFilter === 'credit_card'
                  ? 'bg-brand text-white shadow-2xs'
                  : 'bg-surface-soft text-stone-700 border border-line hover:bg-surface-muted'
              }`}
            >
              <CardIcon className="w-3 h-3" />
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
        <div className="accounts-grid">
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
