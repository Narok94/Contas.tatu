import React, { useLayoutEffect, useRef, useState } from 'react';
import { CreditCard, Search, X } from 'lucide-react';
import { CardInternalItem } from '../types/finance';
import { formatBRL } from '../utils/formatters';
import { categoryDisplayColor } from '../utils/categoryPalette';

interface CardDetailsDialogProps {
  id: string;
  name: string;
  month: string;
  total: number;
  items: CardInternalItem[];
  onClose: () => void;
}

export function CardDetailsDialog({ id, name, month, total, items, onClose }: CardDetailsDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const backdropStart = useRef(false);
  const [search, setSearch] = useState('');
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  const query = normalize(search.trim());
  const visibleItems = items.filter(item => normalize(item.description).includes(query));

  useLayoutEffect(() => {
    const dialog = ref.current!;
    const trigger = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);

  const isBackdrop = (event: React.PointerEvent<HTMLDialogElement>) => {
    if (event.target !== event.currentTarget) return false;
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
  };

  return (
    <dialog ref={ref} id={id} className="card-details-dialog" aria-labelledby={`${id}-title`}
      aria-modal="true" onCancel={event => { event.preventDefault(); onClose(); }}
      onKeyDown={event => {
        if (event.key === 'Escape') {
          event.preventDefault(); onClose(); return;
        }
        if (event.key !== 'Tab') return;
        const dialog = ref.current as HTMLDialogElement;
        const controls = Array.from(dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
        )).filter(element => element.getClientRects().length > 0);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first?.focus();
        }
      }}
      onPointerDown={event => { backdropStart.current = isBackdrop(event); }}
      onPointerUp={event => {
        if (backdropStart.current && isBackdrop(event)) onClose();
        backdropStart.current = false;
      }}>
      <header className="card-details-header">
        <div className="card-details-heading">
          <span className="card-details-icon" aria-hidden="true"><CreditCard size={22} /></span>
          <div>
            <h2 id={`${id}-title`}>Cartão</h2>
            <p>Lançamentos do cartão</p>
          </div>
        </div>
        <button type="button" autoFocus aria-label="Fechar detalhes do cartão" onClick={onClose}>
          <X size={22} />
        </button>
      </header>
      <section className="card-details-summary" aria-label="Resumo da fatura">
        <div>
          <p className="card-details-name">{name}</p>
          <span>Total da fatura</span>
          <strong>{formatBRL(total)}</strong>
        </div>
        <div className="card-details-period">
          <span>{month}</span>
          <b>{items.length} {items.length === 1 ? 'compra' : 'compras'}</b>
        </div>
      </section>
      <div className="card-details-toolbar">
        <label className="card-details-search">
          <Search size={18} aria-hidden="true" />
          <input type="search" aria-label="Buscar por descrição" placeholder="Buscar por descrição…"
            value={search} onChange={event => setSearch(event.target.value)} />
        </label>
        <span role="status" aria-live="polite">{visibleItems.length} {visibleItems.length === 1 ? 'lançamento' : 'lançamentos'}</span>
      </div>
      <div className="card-details-content" tabIndex={0} role="region" aria-label="Extrato do cartão">
        <table className="card-details-statement">
          <caption className="sr-only">Lançamentos de {name} · {month}</caption>
          <thead><tr>
            <th scope="col">Data da compra</th>
            <th scope="col">Descrição</th>
            <th scope="col">Parcela</th>
            <th scope="col">Valor</th>
          </tr></thead>
          <tbody>
            {visibleItems.length > 0 && <tr className="card-details-date-group">
              <th colSpan={4} scope="rowgroup">Data não informada</th>
            </tr>}
            {visibleItems.map(item => <tr key={item.id} className="card-details-entry">
              {/* The current model has a reference month, but no purchase day.
                  Never substitute createdAt or invent the first day of the month. */}
              <td aria-label="Data da compra não informada">—</td>
              <td><span className="card-details-description">{item.description}</span>
                {item.category && <span className="category-chip card-details-category" style={{
                  '--category-color': categoryDisplayColor(item.category.color),
                } as React.CSSProperties}>{item.category.name}</span>}
              </td>
              <td>{item.isInstallment && item.installmentInfo
                ? <span className="card-details-installment">{item.installmentInfo.current}/{item.installmentInfo.total}</span>
                : <span className="card-details-dash">—</span>}</td>
              <td>{formatBRL(item.amount)}</td>
            </tr>)}
            {visibleItems.length === 0 && <tr><td colSpan={4} className="card-details-empty">
              {items.length === 0 ? 'Nenhuma compra lançada nesta fatura' : 'Nenhum lançamento encontrado para esta busca.'}
            </td></tr>}
          </tbody>
        </table>
      </div>
    </dialog>
  );
}
