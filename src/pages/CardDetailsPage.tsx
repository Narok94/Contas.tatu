import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Search } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { formatBRL, formatMonthYear } from '../utils/formatters';
import { categoryDisplayColor } from '../utils/categoryPalette';
import '../cardDetails.css';

export function CardDetailsPage({ cardId, onBack }: { cardId: string; onBack: () => void }) {
  const { monthlyAccounts, currentMonth } = useFinance();
  const account = monthlyAccounts.find(item => item.type === 'credit_card' && item.id === cardId);
  const items = account?.cardInfo?.items ?? [];
  const [search, setSearch] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  const query = normalize(search.trim());
  const visibleItems = items.filter(item => normalize(item.description).includes(query));

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
        {query && <span role="status" aria-live="polite">{visibleItems.length} {visibleItems.length === 1 ? 'resultado' : 'resultados'}</span>}
      </div>
      <table className="card-statement-table">
        <caption className="sr-only">Lançamentos de {account.name} · {formatMonthYear(currentMonth)}</caption>
        <thead><tr>
          <th scope="col">Data da compra</th><th scope="col">Descrição</th><th scope="col">Parcela</th><th scope="col">Valor</th>
        </tr></thead>
        <tbody>
          {visibleItems.map(item => <tr key={item.id} className="card-statement-entry">
            {/* Purchase day is absent in the current model. Preserve source order;
                never infer a purchase date from createdAt or the reference month. */}
            <td className="card-statement-date">Data não informada</td>
            <td><span className="card-statement-description">{item.description}</span>
              {item.category && <span className="category-chip card-statement-category" style={{
                '--category-color': categoryDisplayColor(item.category.color),
              } as React.CSSProperties}>{item.category.name}</span>}
            </td>
            <td>{item.isInstallment && item.installmentInfo
              ? <span className="card-statement-installment">{item.installmentInfo.current}/{item.installmentInfo.total}</span>
              : <span className="card-statement-dash">—</span>}</td>
            <td>{formatBRL(item.amount)}</td>
          </tr>)}
          {visibleItems.length === 0 && <tr><td colSpan={4} className="card-statement-empty">
            {items.length === 0 ? 'Nenhuma compra lançada nesta fatura' : 'Nenhum lançamento encontrado para esta busca.'}
          </td></tr>}
        </tbody>
      </table>
    </> : <p>Cartão não disponível no mês selecionado.</p>}
  </section>;
}
