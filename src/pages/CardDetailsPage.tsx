import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Search, Pencil, Trash2 } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { formatBRL, formatMonthYear } from '../utils/formatters';
import { categoryDisplayColor } from '../utils/categoryPalette';
import { cardStatementRows, formatPurchaseDate } from '../utils/cardStatement';
import { CardPurchaseModal } from '../components/CardPurchaseModal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import type { CardInternalItem } from '../types/finance';
import '../cardDetails.css';

export function CardDetailsPage({ cardId, onBack }: { cardId: string; onBack: () => void }) {
  const { monthlyAccounts, currentMonth, store, deleteCardItem, busy, loading, mode, hasCurrentView } = useFinance();
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
  const heading = useRef<HTMLHeadingElement>(null);
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  const query = normalize(search.trim());
  const visibleRows = account ? cardStatementRows(account, store).filter(({ item }) => normalize(item.description).includes(query)) : [];

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
        {query && <span role="status" aria-live="polite">{visibleRows.length} {visibleRows.length === 1 ? 'resultado' : 'resultados'}</span>}
      </div>
      <table className="card-statement-table">
        <caption className="sr-only">Lançamentos de {account.name} · {formatMonthYear(currentMonth)}</caption>
        <thead><tr>
          <th scope="col">Data da compra</th><th scope="col">Descrição</th><th scope="col">Parcela</th><th scope="col">Valor</th><th scope="col">Ações</th>
        </tr></thead>
        <tbody>
          {visibleRows.map(({ item, purchaseDate }) => <tr key={item.id} className="card-statement-entry">
            <td className="card-statement-date">{formatPurchaseDate(purchaseDate)}</td>
            <td><span className="card-statement-description">{item.description}</span>
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
