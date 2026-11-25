import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Search, Pencil, Trash2 } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { formatBRL, formatMonthYear } from '../utils/formatters';
import { categoryDisplayColor } from '../utils/categoryPalette';
import { filterStatementRows, formatPurchaseDate, type StatementSort } from '../utils/cardStatement';
import { CardPurchaseModal } from '../components/CardPurchaseModal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import type { CardInternalItem } from '../types/finance';
import '../cardDetails.css';
import { EntryDetails } from '../components/EntryDetails';
import { entryAuthors } from '../utils/entryOrigins';

export function CardDetailsPage({ cardId, onBack }: { cardId: string; onBack: () => void }) {
  const { monthlyAccounts, currentMonth, store, categories, deleteCardItem, busy, loading, mode, hasCurrentView } = useFinance();
  const [editingItem, setEditingItem] = useState<CardInternalItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<CardInternalItem | null>(null);
  const deleting = useRef(false);
  const readOnly = Boolean(store.closedMonths?.[currentMonth] || busy || loading || (mode === 'neon' && !hasCurrentView));
  useEffect(() => { setEditingItem(null); setDeletingItem(null); }, [cardId, currentMonth]);
  const confirmDelete = async () => {
    if (!deletingItem || readOnly || deleting.current) return;
    deleting.current = true;
    try {
      if (await deleteCardItem(deletingItem.sourceType, deletingItem.sourceId) !== false) setDeletingItem(null);
    } finally { deleting.current = false; }
  };
  const account = monthlyAccounts.find(item => item.type === 'credit_card' && item.id === cardId);
  const items = account?.cardInfo?.items ?? [];
  const [search, setSearch] = useState('');
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [category, setCategory] = useState('all');
  const [author, setAuthor] = useState('all');
  const [type, setType] = useState('all');
  const [sort, setSort] = useState<StatementSort>('default');
  const authors = entryAuthors(store);
  const activeFilters = Number(category !== 'all') + Number(author !== 'all') + Number(type !== 'all');
  const heading = useRef<HTMLHeadingElement>(null);
  const visibleRows = account ? filterStatementRows(account, store, { search, category, author, type, sort }) : [];

  useEffect(() => {
    window.scrollTo(0, 0);
    heading.current?.focus({ preventScroll: true });
  }, [cardId]);

  return <section className="card-details-page" aria-labelledby="card-statement-title">
    <button type="button" className="card-statement-back" onClick={onBack}>
      <ArrowLeft size={15} aria-hidden="true" />Voltar para Contas
    </button>
    <header className="card-statement-heading">
      <div>
        <h2 id="card-statement-title" ref={heading} tabIndex={-1}>{account?.name ?? 'Cartão'}</h2>
        <p>{formatMonthYear(currentMonth)}</p>
        {account && <EntryDetails type="credit_card" id={account.cardInfo?.cardId ?? account.id} name={account.name} />}
      </div>
      {account && <div className="card-statement-summary">
        <span>Total da fatura: <strong>{formatBRL(account.amount)}</strong></span>
        <span>{items.length} {items.length === 1 ? 'lançamento' : 'lançamentos'}</span>
      </div>}
    </header>
    {account ? <>
      <div className="card-statement-toolbar">
        <label className="card-statement-search">
          <Search size={16} aria-hidden="true" />
          <input type="search" aria-label="Buscar por descrição" placeholder="Buscar por descrição..."
            value={search} onChange={event => setSearch(event.target.value)} />
        </label>
        <span role="status" aria-live="polite">{visibleRows.length} de {items.length} lançamentos</span>
        <button type="button" className="card-statement-filter-toggle" aria-expanded={filtersExpanded} aria-controls="statement-filters" onClick={() => setFiltersExpanded(value => !value)}>Filtrar e ordenar{activeFilters > 0 ? ` (${activeFilters})` : ''}{sort !== 'default' ? ' · Ordenação ativa' : ''}</button>
      </div>
      <div id="statement-filters" className="card-statement-filters" hidden={!filtersExpanded}>
        <label>Organizar por<select value={sort} onChange={event => setSort(event.target.value as StatementSort)}>
          <option value="default">Data da compra (padrão)</option><option value="newest">Mais recentes primeiro</option><option value="oldest">Mais antigos primeiro</option><option value="highest">Maior valor</option><option value="lowest">Menor valor</option><option value="name">Nome A–Z</option>
        </select></label>
        <label>Adicionado por<select value={author} onChange={event => setAuthor(event.target.value)}>
          <option value="all">Todas as pessoas</option>{authors.map(([id, name]) => <option key={id} value={id}>{name}</option>)}<option value="unknown">Autor não registrado</option>
        </select></label>
        <label>Categoria<select value={category} onChange={event => setCategory(event.target.value)}>
          <option value="all">Todas as categorias</option>{categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}<option value="unknown">Sem categoria</option>
        </select></label>
        <label>Tipo de compra<select value={type} onChange={event => setType(event.target.value)}>
          <option value="all">Todos os tipos</option><option value="simple_expense">À vista</option><option value="installment">Parceladas</option>
        </select></label>
        <p>Mais recentes e mais antigos usam a data do cadastro, não a data da compra.</p>
        {(activeFilters > 0 || sort !== 'default' || search) && <button type="button" onClick={() => { setSearch(''); setCategory('all'); setAuthor('all'); setType('all'); setSort('default'); }}>Limpar filtros</button>}
      </div>
      <table className="card-statement-table">
        <caption className="sr-only">Lançamentos de {account.name} · {formatMonthYear(currentMonth)}</caption>
        <thead><tr>
          <th scope="col">Data da compra</th><th scope="col">Descrição</th><th scope="col">Parcela</th><th scope="col">Valor</th><th scope="col">Ações</th>
        </tr></thead>
        <tbody>
          {visibleRows.map(({ item, purchaseDate }) => <tr key={item.id} className="card-statement-entry">
            <td className="card-statement-date">{formatPurchaseDate(purchaseDate)}</td>
            <td><EntryDetails type={item.sourceType} id={item.sourceId} name={item.description} nameAsTrigger />
              {item.category && <span className="category-chip card-statement-category" style={{
                '--category-color': categoryDisplayColor(item.category.color),
              } as React.CSSProperties}>{item.category.name}</span>}
            </td>
            <td>{item.isInstallment && item.installmentInfo
              ? <span className="card-statement-installment">{item.installmentInfo.current}/{item.installmentInfo.total}</span>
              : <span className="card-statement-dash">—</span>}</td>
            <td>{formatBRL(item.amount)}</td>
            <td><div className="card-statement-actions">
              <button type="button" disabled={readOnly} aria-label={`Editar ${item.description}`} title="Editar lançamento" onClick={() => setEditingItem(item)}><Pencil size={14} aria-hidden="true" /><span>Editar</span></button>
              <button type="button" disabled={readOnly} className="card-item-delete" aria-label={`Excluir ${item.description}`} title="Excluir lançamento" onClick={() => setDeletingItem(item)}><Trash2 size={14} aria-hidden="true" /><span>Excluir</span></button>
            </div></td>
          </tr>)}
          {visibleRows.length === 0 && <tr><td colSpan={5} className="card-statement-empty">
            {items.length === 0 ? 'Nenhuma compra lançada nesta fatura' : 'Nenhum lançamento encontrado para esta busca.'}
          </td></tr>}
        </tbody>
      </table>
      {store.closedMonths?.[currentMonth] && <p className="card-statement-readonly">Mês fechado. Reabra o mês no Histórico para editar ou excluir lançamentos.</p>}
    </> : <p>Cartão não disponível no mês selecionado.</p>}
    <CardPurchaseModal isOpen={Boolean(editingItem)} cardId={account?.cardInfo?.cardId ?? cardId} editingItem={editingItem} onClose={() => setEditingItem(null)} />
    <ConfirmDialog isOpen={Boolean(deletingItem)} title="Excluir lançamento do cartão"
      message={mode === 'neon' && deletingItem?.sourceType === 'installment'
        ? 'Cancelar as parcelas a partir do mês selecionado, preservando os meses anteriores?'
        : 'Deseja excluir esta compra da fatura do cartão?'}
      itemName={deletingItem?.description} confirmLabel={busy ? 'Excluindo…' : 'Sim, excluir'}
      onConfirm={() => void confirmDelete()} onCancel={() => { if (!deleting.current) setDeletingItem(null); }} />
  </section>;
}
