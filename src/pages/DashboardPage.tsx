import '../dashboard.css';
import React from 'react';
import { ArrowRight, CheckCircle2, Circle, Layers, ReceiptText } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { TatuIllustration } from '../components/TatuIllustration';
import { formatBRL, formatMonthYear } from '../utils/formatters';
import { categoryDisplayColor } from '../utils/categoryPalette';
import { getCategoryOrTypeIcon } from '../utils/iconHelper';

export const DashboardPage: React.FC = () => {
  const { currentMonth, financialSummary: summary, monthlyAccounts, toggleAccountStatus, setActiveTab } = useFinance();
  const pendingAccounts = monthlyAccounts.filter(account => account.status === 'pendente');
  const paidCount = monthlyAccounts.filter(account => account.status === 'pago').length;
  // Same value-based progress used by the existing dashboard.
  const paidPercent = summary.totalExpected > 0 ? Math.round(summary.totalPaid / summary.totalExpected * 100) : 0;
  const endingInstallments = summary.activeEndingInstallments || [];
  const goToAccounts = () => setActiveTab('accounts');

  return (
    <div className="desktop-dashboard">
      <section className="desk-hero" aria-labelledby="desk-title">
        <div className="desk-hero-copy">
          <p className="desk-eyebrow">QUE BOM TER VOCÊ POR AQUI.</p>
          <h2 id="desk-title">{summary.pendingCount === 0 ? 'Tudo pago por aqui' : summary.pendingCount === 1 ? 'Falta apenas 1 conta para fechar o mês' : `Faltam ${summary.pendingCount} contas para fechar o mês`}</h2>
          <p>{summary.pendingCount === 0 ? 'Todas as contas e faturas deste mês já estão quitadas.' : `${summary.pendingCount} de ${summary.totalCount} contas ainda aguardam quitação.`}</p>
          <div className="desk-hero-actions">
            <div className="desk-hero-progress"><span>{paidPercent}% do valor previsto já pago</span><div className="desk-track" role="progressbar" aria-label="Percentual do valor previsto pago" aria-valuemin={0} aria-valuemax={100} aria-valuenow={paidPercent}><div style={{ width: `${paidPercent}%` }} /></div></div>
            <button id="btn-goto-accounts" type="button" onClick={goToAccounts} className="desk-primary">Ver contas <ArrowRight size={15} /></button>
          </div>
        </div>
        <div className="desk-hero-art"><TatuIllustration className="desk-mascot" /></div>
      </section>

      <section className="desk-metrics" aria-label="Indicadores do mês">
        <article className="desk-metric metric-total"><div><ReceiptText size={18} /><h3>Total do mês</h3></div><strong>{formatBRL(summary.totalExpected)}</strong><p>{summary.totalCount} contas em {formatMonthYear(currentMonth)}</p></article>
        <article className="desk-metric metric-paid"><div><CheckCircle2 size={18} /><h3>Pago</h3></div><strong>{formatBRL(summary.totalPaid)}</strong><p>{paidCount} contas pagas</p></article>
        <article className="desk-metric metric-pending"><div><Circle size={18} /><h3>Pendente</h3></div><strong>{formatBRL(summary.totalPending)}</strong><p>{summary.previousPendingCardsTotal > 0 ? `+ ${formatBRL(summary.previousPendingCardsTotal)} em faturas anteriores` : `${summary.pendingCount} contas em aberto`}</p></article>
        <article className="desk-metric metric-installments"><div><Layers size={18} /><h3>Parcelamentos perto do fim</h3></div><strong>{endingInstallments.length}</strong><p>Com até 3 parcelas restantes</p></article>
      </section>

      <div className="desk-workspace">
        <section className="desk-panel desk-open" aria-labelledby="desk-open-title">
          <header><div><h3 id="desk-open-title">Contas em aberto</h3><p>Uma conta de cada vez. Seu mês mais leve.</p></div><button type="button" className="desk-link" onClick={goToAccounts}>Ver todas <ArrowRight size={14} /></button></header>
          {pendingAccounts.length === 0 ? <div className="desk-empty"><CheckCircle2 size={30} /><h4>Tudo em dia neste mês!</h4><p>As contas e faturas do mês estão marcadas como pagas.</p></div> : (
            <div className="desk-account-list">
              {pendingAccounts.slice(0, 5).map(account => (
                <div className="desk-account-row" key={account.id}>
                  <span className="desk-account-icon category-chip" style={{ '--category-color': categoryDisplayColor(account.category?.color || 'var(--color-brand)') } as React.CSSProperties}>{getCategoryOrTypeIcon(account.category?.name, account.type, 'w-4 h-4')}</span>
                  <div className="desk-account-name"><h4>{account.name}</h4><p>{account.category?.name || 'Geral'} · {account.type === 'credit_card' ? 'Fatura de cartão' : account.type === 'recurring' ? 'Fixa' : account.type === 'installment' ? `Parcela ${account.installmentInfo?.currentInstallment}/${account.installmentInfo?.totalInstallments}` : 'Simples'}</p></div>
                  <strong>{formatBRL(account.amount)}</strong>
                  <button type="button" className="desk-pay" aria-label={`Marcar ${account.name} como pago`} onClick={() => toggleAccountStatus(account)}>Pagar</button>
                </div>
              ))}
            </div>
          )}
          <p className="desk-panel-foot">{pendingAccounts.length > 5 ? `Exibindo 5 de ${pendingAccounts.length} contas em aberto. A lista completa está em Contas.` : `${pendingAccounts.length} contas em aberto em ${formatMonthYear(currentMonth)}.`}</p>
        </section>

        <section className="desk-panel desk-progress" aria-labelledby="desk-progress-title">
          <header><div><h3 id="desk-progress-title">Progresso do mês</h3><p>Seu caminho até um mês organizado.</p></div><CheckCircle2 size={20} /></header>
          <div className="desk-progress-main"><strong>{paidPercent}<span>%</span></strong><div><h4>{paidCount} de {summary.totalCount} contas pagas</h4><p>do valor previsto já pago</p></div></div>
          <div className="desk-track desk-track-large" role="progressbar" aria-label="Progresso do mês em valor pago" aria-valuemin={0} aria-valuemax={100} aria-valuenow={paidPercent}><div style={{ width: `${paidPercent}%` }} /></div>
          <dl className="desk-counts"><div><dt>Pagas</dt><dd>{paidCount}</dd></div><div><dt>Pendentes</dt><dd>{summary.pendingCount}</dd></div><div><dt>Total</dt><dd>{summary.totalCount}</dd></div></dl>
          <div className="desk-positive"><span>UM PASSO DE CADA VEZ</span><p>Pequenas escolhas fazem grande diferença.</p></div>
        </section>
      </div>
    </div>
  );
};
