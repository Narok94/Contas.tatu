import React, { useState } from 'react';
import { useFinance } from '../context/FinanceContext';
import { formatBRL, formatMonthYear } from '../utils/formatters';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { AccountType } from '../types/finance';

const typeNames: Record<AccountType, string> = { simple: 'Simples', recurring: 'Fixas', installment: 'Parcelamentos avulsos', credit_card: 'Faturas de cartão' };

export function HistoryPage() {
  const { currentMonth, store, monthlyAccounts, financialSummary, closeCurrentMonth, setActiveTab } = useFinance();
  const [confirmMonth, setConfirmMonth] = useState<string | null>(null);
  const snapshot = store.closedMonths?.[currentMonth];
  const accounts = snapshot?.accounts ?? monthlyAccounts;
  const summary = snapshot?.summary ?? financialSummary;
  const previousCount = accounts.reduce((count, account) => count + (account.cardInfo?.previousPendingInvoices.length ?? 0), 0);
  const pending = accounts.filter(account => account.status !== 'pago' || (account.recurringInfo && !account.recurringInfo.isValueSet)).length;
  return <section className="history-page">
    <div className="history-heading"><div><span className="history-eyebrow">CONSULTA MENSAL</span><h1>Histórico</h1><p>Consulte os registros e preserve o fechamento de cada mês.</p></div><span className={`history-status ${snapshot ? 'closed' : ''}`}>{snapshot ? 'Fechado' : 'Em andamento'}</span></div>
    <section className="history-panel">
      <div className="history-month"><h2>{formatMonthYear(currentMonth)}</h2><span>{accounts.length} contas · {summary.totalCount - summary.pendingCount} pagas · {summary.pendingCount} pendentes</span></div>
      <div className="history-totals"><div><span>Total do mês</span><strong>{formatBRL(summary.totalExpected)}</strong></div><div><span>Total pago</span><strong>{formatBRL(summary.totalPaid)}</strong></div><div><span>Total pendente</span><strong>{formatBRL(summary.totalPending)}</strong></div></div>
      {snapshot ? <p className="history-provenance">Fechado em {new Date(snapshot.closedAt).toLocaleString('pt-BR')}. Este retrato está preservado e não permite alterações.</p> : <p className="history-provenance">Dados reconstruídos a partir dos registros disponíveis. Este mês ainda não tem um retrato de fechamento; alterações nos cadastros podem atualizar esta consulta.</p>}
      {!snapshot && <div className="history-closing"><p>{pending ? `Ainda há ${pending} conta(s) deste mês para resolver antes do fechamento.` : `Todas as contas de ${formatMonthYear(currentMonth)} estão resolvidas. Você já pode fechar o mês.`}</p><button className="finance-primary" onClick={() => pending ? setActiveTab('accounts') : setConfirmMonth(currentMonth)}>{pending ? 'Resolver em Contas' : 'Fechar mês'}</button></div>}
      {previousCount > 0 && <p className="history-hint">{snapshot ? 'No momento do fechamento, havia' : 'Existem'} {formatBRL(summary.previousPendingCardsTotal)} em {previousCount} faturas de meses anteriores. Esse saldo é separado das contas deste mês e {snapshot ? 'não foi quitado por este fechamento' : 'não impede seu fechamento'}.</p>}
    </section>
    <div className="history-breakdowns">
      <section className="history-panel"><h2>Por categoria</h2>{summary.categoryBreakdown.length ? summary.categoryBreakdown.map(category => <div className="history-row" key={category.categoryId}><span>{category.categoryName}</span><strong>{formatBRL(category.total)}</strong></div>) : <p>Sem valores registrados por categoria.</p>}<p className="history-hint">Compras dos cartões aparecem em suas próprias categorias.</p></section>
      <section className="history-panel"><h2>Por tipo de conta</h2>{(Object.keys(typeNames) as AccountType[]).map(type => { const items = accounts.filter(account => account.type === type); return <div className="history-row" key={type}><span>{typeNames[type]} <small>({items.length})</small></span><strong>{formatBRL(items.reduce((sum, item) => sum + item.amount, 0))}</strong></div>; })}</section>
    </div>
    <section className="history-panel"><h2>Contas do mês</h2>{!accounts.length && <p>Nenhuma conta encontrada nos registros disponíveis.</p>}{accounts.map(account => <div className="history-account" key={`${account.type}:${account.id}`}><div className="history-row"><span><b>{account.name}</b><small>{typeNames[account.type]} · {account.status === 'pago' ? 'Pago' : 'Pendente'}</small></span><strong>{formatBRL(account.amount)}</strong></div>{account.cardInfo && account.cardInfo.items.length > 0 && <details><summary>Ver {account.cardInfo.items.length} compras</summary>{account.cardInfo.items.map(item => <div className="history-row" key={item.id}><span>{item.description}<small>{item.category?.name ?? 'Geral / Outros'}</small></span><span>{formatBRL(item.amount)}</span></div>)}</details>}</div>)}</section>
    <ConfirmDialog isOpen={confirmMonth === currentMonth} title="Fechar este mês?" message={`${formatMonthYear(currentMonth)}: ${accounts.length} contas, ${formatBRL(summary.totalExpected)} no total e ${formatBRL(summary.totalPaid)} pagos. O mês será fechado e não poderá mais ser editado. Não há reabertura nesta versão.`} confirmLabel="Confirmar fechamento" isDestructive={false} onCancel={() => setConfirmMonth(null)} onConfirm={() => { if (closeCurrentMonth()) setConfirmMonth(null); }} />
  </section>;
}
