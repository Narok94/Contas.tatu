import '../accounts.css';
import React, { useState, useMemo } from 'react';
import {
  CheckCircle2,
  Circle,
  Layers,
  CreditCard as CardIcon,
  Repeat,
  FileText,
  SlidersHorizontal, ChevronDown, ChevronUp,
} from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { UnifiedMonthlyAccount } from '../types/finance';
import { AccountCard } from '../components/AccountCard';
import { CreditCardAccountCard, CardInternalItem } from '../components/CreditCardAccountCard';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { CardPurchaseModal } from '../components/CardPurchaseModal';
import { formatBRL, formatMonthYear } from '../utils/formatters';

type StatusFilterType = 'all' | 'pendente' | 'pago' | 'parcial';
type SortOrder = 'default' | 'highest' | 'lowest' | 'category' | 'name';
type AccountTypeFilter = 'all' | 'simple' | 'recurring' | 'installment' | 'credit_card';

export const AccountsPage: React.FC = () => {
  const {
    currentMonth,
    categories,
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
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('default');
  const activeFilters = Number(statusFilter !== 'all') + Number(typeFilter !== 'all') + Number(categoryFilter !== 'all');
  const hasConfiguration = activeFilters > 0 || sortOrder !== 'default';

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
      if ((statusFilter === 'pago' && acc.status !== 'pago') || (statusFilter === 'pendente' && acc.status === 'pago')) {
        return false;
      }
      if (statusFilter === 'parcial' && acc.status !== 'parcial') return false;
      if (categoryFilter !== 'all' && acc.categoryId !== categoryFilter) return false;
      // Bloco 2: Tipo de Conta
      if (typeFilter !== 'all' && acc.type !== typeFilter) {
        return false;
      }
      return true;
    }).sort((a, b) => Number(a.status === 'pago') - Number(b.status === 'pago')).sort((a, b) => {
      switch (sortOrder) {
        case 'highest': return b.amount - a.amount;
        case 'lowest': return a.amount - b.amount;
        case 'category': return (a.category?.name ?? '').localeCompare(b.category?.name ?? '', 'pt-BR');
        case 'name': return a.name.localeCompare(b.name, 'pt-BR');
        default: return 0;
      }
    });
  }, [monthlyAccounts, statusFilter, typeFilter, categoryFilter, sortOrder]);

  // Contadores para o resumo e badges
  const paidCount = monthlyAccounts.filter((a) => a.status === 'pago').length;
  const pendingCount = monthlyAccounts.filter((a) => a.status !== 'pago').length;

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
      </header>

      <section className="accounts-summary" aria-label="Resumo financeiro do mês">
        <div className="accounts-total">
          <span><Layers size={15} />Total previsto</span>
          <strong>{formatBRL(financialSummary.totalExpected)}</strong>
        </div>
        <div className="accounts-pending">
          <span><Circle size={15} />Ainda pendente</span>
          <strong>{formatBRL(financialSummary.totalPending)}</strong>
          {financialSummary.totalOpenWithPreviousPending > financialSummary.totalPending && <small>+ {formatBRL(financialSummary.previousPendingCardsTotal)} em faturas anteriores no fechamento</small>}
        </div>
        <div className="accounts-paid">
          <span><CheckCircle2 size={15} />Total pago</span>
          <strong>{formatBRL(financialSummary.totalPaid)}</strong>
        </div>
      </section>

      {/* Control Filters Bar - Bloco 1 (Status) + Bloco 2 (Tipo de Conta) */}
      <div className="accounts-list-toolbar">
        <span aria-live="polite" aria-atomic="true" className="accounts-result-count">{filteredAccounts.length} {filteredAccounts.length === 1 ? 'conta' : 'contas'}</span>
        <button id="toggle-account-filters" type="button" aria-expanded={filtersExpanded} aria-controls="account-filters" onClick={() => setFiltersExpanded(value => !value)}>
          <SlidersHorizontal size={14} /> Filtrar{activeFilters > 0 && <span className="accounts-filter-indicator">· {activeFilters}</span>}
          {sortOrder !== 'default' && <span className="accounts-filter-indicator" title="Ordenação personalizada ativa" aria-label="Ordenação personalizada ativa">↕</span>}
          {filtersExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>
      <div id="account-filters" className="accounts-filters" hidden={!filtersExpanded}>
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
            <button id="filter-status-partial" type="button" aria-pressed={statusFilter === 'parcial'} onClick={() => setStatusFilter('parcial')} className={`px-3 py-1 rounded-xl text-xs font-semibold ${statusFilter === 'parcial' ? 'bg-amber-700 text-white' : 'bg-amber-50 text-amber-900 border border-amber-200/80'}`}>Parciais ({monthlyAccounts.filter(a => a.status === 'parcial').length})</button>
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
        <div className="accounts-filter-group">
          <label htmlFor="filter-category">Categoria</label>
          <select id="filter-category" value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)}>
            <option value="all">Todas as categorias</option>
            {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </div>
        <div className="accounts-filter-group">
          <label htmlFor="account-sort">Organizar por</label>
          <select id="account-sort" value={sortOrder} onChange={event => setSortOrder(event.target.value as SortOrder)}>
            <option value="default">Padrão</option>
            <option value="highest">Maior valor</option>
            <option value="lowest">Menor valor</option>
            <option value="category">Categoria</option>
            <option value="name">Nome A–Z</option>
          </select>
        </div>
        {hasConfiguration && <button type="button" className="accounts-clear-filters" onClick={() => { setStatusFilter('all'); setTypeFilter('all'); setCategoryFilter('all'); setSortOrder('default'); }}>Limpar filtros</button>}
      </div>

      {/* Grid of Accounts (up to 4 cards per row according to available width, independent height) */}
      {filteredAccounts.length === 0 ? (
        <div className="py-14 text-center bg-white border border-stone-200 rounded-xl p-8 shadow-xs">
          <div className="w-12 h-12 rounded-full bg-stone-100 text-stone-400 mx-auto flex items-center justify-center mb-3">
            <Layers className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-stone-800">
            Nenhuma conta encontrada
          </h3>
          <p className="text-sm text-stone-500 mt-1 max-w-md mx-auto">
            Não há contas correspondentes aos filtros selecionados para este mês. Tente alternar os filtros de status, tipo ou categoria.
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
