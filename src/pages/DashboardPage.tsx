import '../dashboard.css';
import React from 'react';
import { PaymentOptions } from '../components/PaymentOptions';
import { ArrowRight, Coins, ArrowDown, Check, WalletCards, Tag, ChartNoAxesColumnIncreasing, CalendarCheck, RefreshCw, TrendingDown, Sparkles } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { computeDesktopInsights } from '../domain/desktopInsights';
import mascot from '../assets/tatu/tatu-joinha.png';
import { formatBRL } from '../utils/formatters';
import { categoryDisplayColor } from '../utils/categoryPalette';
import { getCategoryOrTypeIcon } from '../utils/iconHelper';

export const DashboardPage: React.FC = () => {
  const { store, currentMonth, financialSummary: summary, monthlyAccounts, toggleAccountStatus, setActiveTab } = useFinance();
  const insights = computeDesktopInsights(currentMonth, store);
  const pendingAccounts = monthlyAccounts.filter(account => account.status !== 'pago');
  const goToAccounts = () => setActiveTab('accounts');

  return (
    <div className="desktop-dashboard">
      <section className="desk-metrics" aria-label="Indicadores do mês">
        <article className="desk-metric metric-total"><span className="desk-metric-icon" aria-hidden="true"><Coins size={32} /></span><h3>Total do mês</h3><strong>{formatBRL(summary.totalExpected)}</strong></article>
        <article className="desk-metric metric-pending"><span className="desk-metric-icon" aria-hidden="true"><ArrowDown size={20} /></span><h3>Total pendente</h3><strong>{formatBRL(summary.totalPending)}</strong></article>
        <article className="desk-metric metric-paid"><span className="desk-metric-icon" aria-hidden="true"><Check size={20} /></span><h3>Total pago</h3><strong>{formatBRL(summary.totalPaid)}</strong></article>
      </section>
      <div className="desk-workspace">
        <section className="desk-panel desk-open" aria-labelledby="desk-open-title">
          <header><h3 id="desk-open-title"><WalletCards />Contas em aberto</h3><button type="button" className="desk-link" onClick={goToAccounts}>Ver todas <ArrowRight size={14} /></button></header>
          {pendingAccounts.length === 0 ? <p className="desk-empty">Nenhuma conta em aberto neste mês.</p> : (
            <div className="desk-account-list">
              {pendingAccounts.slice(0, 5).map(account => (
                <div className="desk-account-row" key={account.id}>
                  <span className="desk-account-icon category-chip" style={{ '--category-color': categoryDisplayColor(account.category?.color || 'var(--color-brand)') } as React.CSSProperties}>{getCategoryOrTypeIcon(account.category?.name || account.name, account.type, 'w-3.5 h-3.5')}</span>
                  <div className="desk-account-name"><h4>{account.name}</h4><p>{account.category?.name || 'Geral'} · {account.type === 'credit_card' ? 'Fatura de cartão' : account.type === 'recurring' ? 'Fixa' : account.type === 'installment' ? `Parcela ${account.installmentInfo?.currentInstallment}/${account.installmentInfo?.totalInstallments}` : 'Simples'}</p></div>
                  <strong>{formatBRL(account.cardInfo?.totalOpenAmount ?? account.amount)}</strong>
                  <div className="payment-actions"><button type="button" className="desk-pay" aria-label={`Marcar ${account.name} como pago`} onClick={() => toggleAccountStatus(account)}>Pagar</button><PaymentOptions account={account} /></div>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="desk-panel desk-insights" id="desktop-reports" tabIndex={-1} aria-labelledby="desk-insights-title">
          <header><h3 id="desk-insights-title"><ChartNoAxesColumnIncreasing />Insights do mês <Sparkles className="insight-sparkle" /></h3></header>
          <div className="insight-list">
            <div className="insight-row"><span><CalendarCheck /></span><p><strong>{insights.endingCount} {insights.endingCount === 1 ? 'parcelamento termina' : 'parcelamentos terminam'} este mês</strong><br />Liberando {formatBRL(insights.releasedAmount)} do orçamento.</p></div>
            <div className="insight-row"><span><RefreshCw /></span><p><strong>{insights.continuingCount} {insights.continuingCount === 1 ? 'compra parcelada continua' : 'compras parceladas continuam'}</strong><br />para o próximo mês.</p></div>
            <div className="insight-row"><span><TrendingDown /></span><p><strong>{insights.reduction === 0 ? 'Sem variação nos compromissos' : `${formatBRL(Math.abs(insights.reduction))} ${insights.reduction > 0 ? 'a menos' : 'a mais'} em compromissos`}</strong><br />parcelados previstos para o próximo mês.</p></div>
          </div>
          <img className="insight-mascot" src={mascot} alt="" aria-hidden="true" />
          <p className="insight-note">Projeção dos parcelamentos cadastrados; não inclui novas compras ou contas variáveis.</p>
        </section>
        <section className="desk-panel desk-categories" aria-labelledby="desk-categories-title">
          <header><h3 id="desk-categories-title"><Tag />Gastos por categoria</h3></header>
          {summary.categoryBreakdown.length === 0 ? <p className="desk-empty">Nenhum gasto neste mês.</p> : <ul className="desk-category-list">
            {summary.categoryBreakdown.map(category => <li key={category.categoryId} style={{ '--category-color': categoryDisplayColor(category.categoryColor) } as React.CSSProperties}>
              <div><span className="desk-category-label">{getCategoryOrTypeIcon(category.categoryName)}{category.categoryName}</span><strong>{formatBRL(category.total)}</strong></div>
              <div className="desk-category-caption"><div className="desk-category-track" aria-hidden="true"><span style={{ width: `${category.percentage}%` }} /></div><small>{Math.round(category.percentage)}%</small></div>
            </li>)}
          </ul>}
        </section>
      </div>
    </div>
  );
};
