import React, { useState } from 'react';
import { useFinance } from '../context/FinanceContext';
import { formatBRL, formatMonthYear, formatMonthEnd, getCurrentMonth } from '../utils/formatters';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { canCloseMonth } from '../domain/monthOperations';
import { computeAnnualHistory, computeActiveInstallments } from '../domain/history';

const monthNames = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

export function HistoryPage() {
  const { currentMonth, setCurrentMonth, store, monthlyAccounts, financialSummary, closeCurrentMonth, reopenCurrentMonth } = useFinance();
  const [view, setView] = useState<'monthly' | 'annual'>('monthly');
  const [year, setYear] = useState(() => Number(currentMonth.slice(0, 4)));
  const [annualView, setAnnualView] = useState<'expenses' | 'installments'>('expenses');
  const installmentMonth = getCurrentMonth();
  const installments = view === 'annual' && annualView === 'installments' ? computeActiveInstallments(installmentMonth, store) : [];
  const [confirmation, setConfirmation] = useState<{ month: string; action: 'close' | 'reopen' } | null>(null);
  const snapshot = store.closedMonths?.[currentMonth];
  const accounts = snapshot?.accounts ?? monthlyAccounts;
  const summary = snapshot?.summary ?? financialSummary;
  const eligible = canCloseMonth(store, currentMonth);
  const annual = view === 'annual' ? computeAnnualHistory(year, store) : null;
  const reopening = confirmation?.action === 'reopen';

  return <section className="history-page">
    <div className="history-heading">
      <h1>Histórico</h1>
      <div className="history-view" role="group" aria-label="Visão do histórico">
        <button type="button" aria-pressed={view === 'monthly'} onClick={() => setView('monthly')}>Mensal</button>
        <button type="button" aria-pressed={view === 'annual'} onClick={() => { setYear(Number(currentMonth.slice(0, 4))); setView('annual'); }}>Anual</button>
      </div>
    </div>
    {view === 'monthly' ? <>
      <section className="history-panel">
        <div className="history-month"><h2>{formatMonthYear(currentMonth)}</h2><span className={`history-status ${snapshot ? 'closed' : ''}`}>{snapshot ? 'Fechado' : 'Em andamento'}</span></div>
        <div className="history-totals">
          <div><span>Total do mês</span><strong>{formatBRL(summary.totalExpected)}</strong></div>
          <div><span>Total pago</span><strong>{formatBRL(summary.totalPaid)}</strong></div>
          <div><span>Total pendente</span><strong>{formatBRL(summary.totalPending)}</strong></div>
        </div>
        {(snapshot || eligible) && <div className="history-closing">
          <p>{snapshot ? `Mês fechado em ${new Date(snapshot.closedAt).toLocaleDateString('pt-BR')}` : 'Todas as contas estão pagas.'}</p>
          <button type="button" className={snapshot ? 'history-secondary' : 'finance-primary'} onClick={() => setConfirmation({ month: currentMonth, action: snapshot ? 'reopen' : 'close' })}>{snapshot ? 'Reabrir mês' : 'Fechar mês'}</button>
        </div>}
        {summary.previousPendingCardsTotal > 0 && <p className="history-hint">{snapshot ? 'No fechamento, havia' : 'Há'} {formatBRL(summary.previousPendingCardsTotal)} em aberto de meses anteriores.</p>}
      </section>
      <section className="history-panel history-account-list">
        <h2>Contas do mês <span className="history-count">{accounts.length}</span></h2>
        {!accounts.length && <p>Nenhuma conta neste mês.</p>}
        {accounts.map(account => <div className="history-account" key={`${account.type}:${account.id}`}>
          <div className="history-row">
            <span><b>{account.name}</b>{account.category && <small>{account.category.name}</small>}</span>
            <span className="history-account-value"><strong>{formatBRL(account.amount)}</strong><small className={account.status === 'pago' ? 'history-paid' : ''}>{account.status === 'pago' ? 'Pago' : account.status === 'parcial' ? 'Parcial' : 'Pendente'}</small></span>
          </div>
          {account.status === 'parcial' && account.cardInfo && <p className="history-hint">Pago: {formatBRL(account.cardInfo.paidAmount ?? 0)} · Restante: {formatBRL(account.cardInfo.totalOpenAmount)}</p>}
          {account.cardInfo && account.cardInfo.items.length > 0 && <details><summary>Ver compras</summary>{account.cardInfo.items.map(item => <div className="history-row" key={item.id}><span>{item.description}<small>{item.category?.name ?? 'Sem categoria'}</small></span><strong>{formatBRL(item.amount)}</strong></div>)}</details>}
        </div>)}
      </section>
      {summary.categoryBreakdown.length > 0 && <details className="history-panel history-categories"><summary>Gastos por categoria</summary>{summary.categoryBreakdown.map(category => <div className="history-row" key={category.categoryId}><span>{category.categoryName}</span><strong>{formatBRL(category.total)}</strong></div>)}</details>}
    </> : <section className="history-panel history-annual">
      <div className="history-annual-controls">
      <div className="history-view" role="group" aria-label="Consulta anual">
        <button type="button" aria-pressed={annualView === 'expenses'} onClick={() => setAnnualView('expenses')}>Gastos</button>
        <button type="button" aria-pressed={annualView === 'installments'} onClick={() => setAnnualView('installments')}>Parcelamentos</button>
      </div>
      {annualView === 'expenses' && <div className="history-year" role="group" aria-label="Selecionar ano">
        <button type="button" aria-label="Ano anterior" onClick={() => setYear(value => Math.max(1, value - 1))}>‹</button>
        <span>{year}</span>
        <button type="button" aria-label="Próximo ano" onClick={() => setYear(value => Math.min(9999, value + 1))}>›</button>
      </div>}
      </div>
      {annualView === 'expenses' ? <>
      <div className="history-year-total"><h2>Total gasto em {year}</h2><strong>{formatBRL(annual!.total)}</strong><p>O que você já pagou neste ano.</p></div>
      <div className="history-month-grid">{annual!.months.map((month, index) => <button type="button" key={month.month} aria-label={`Consultar ${formatMonthYear(month.month)}`} onClick={() => { setCurrentMonth(month.month); setView('monthly'); }}>
        <span>{monthNames[index]}{month.closed && <small>Fechado</small>}</span><strong>{formatBRL(month.total)}</strong>
      </button>)}</div>
      </> : <div className="history-installments">
        <h2>Parcelamentos ativos</h2><p>Em {formatMonthYear(installmentMonth)}</p>
        {!installments.length && <p className="history-hint">Nenhum parcelamento ativo neste mês.</p>}
        <div className="history-installment-list">{installments.map(item => <div className="history-row" key={item.id}>
          <span><b>{item.name}</b><small>{item.current}/{item.total} · {formatBRL(item.amount)}</small></span>
          <span className="history-installment-end">Termina em <strong>{formatMonthEnd(item.endMonth)}</strong></span>
        </div>)}</div>
      </div>}
    </section>}
    <ConfirmDialog isOpen={view === 'monthly' && confirmation?.month === currentMonth} title={`${reopening ? 'Reabrir' : 'Fechar'} ${formatMonthYear(currentMonth)}?`} message={reopening ? 'Você poderá adicionar ou corrigir contas deste mês novamente.' : 'Todas as contas estão pagas. Você poderá reabrir este mês depois, se precisar fazer alguma correção.'} confirmLabel={reopening ? 'Reabrir mês' : 'Fechar mês'} isDestructive={false} onCancel={() => setConfirmation(null)} onConfirm={() => { if ((reopening ? reopenCurrentMonth : closeCurrentMonth)()) setConfirmation(null); }} />
  </section>;
}
