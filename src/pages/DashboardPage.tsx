import { categoryDisplayColor } from '../utils/categoryPalette';
import { TatuIllustration } from '../components/TatuIllustration';
import React, { useState, useMemo } from 'react';
import {
  CheckCircle2,
  Clock,
  Layers,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  Sparkles,
  ChevronDown,
  ChevronUp,
  CreditCard as CardIcon,
  Circle,
  PiggyBank,
} from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { computeFinancialSummary } from '../domain/financeRules';
import { formatBRL, formatMonthYear, formatMonthEnd, addMonths } from '../utils/formatters';

export const DashboardPage: React.FC = () => {
  const {
    currentMonth,
    financialSummary,
    monthlyAccounts,
    toggleAccountStatus,
    setActiveTab,
    store,
  } = useFinance();

  const [showAllEnding, setShowAllEnding] = useState(false);

  // Comparação com o mês anterior
  const previousMonth = useMemo(() => addMonths(currentMonth, -1), [currentMonth]);
  const previousMonthSummary = useMemo(
    () => computeFinancialSummary(previousMonth, store),
    [previousMonth, store]
  );
  const monthDiff = financialSummary.totalExpected - previousMonthSummary.totalExpected;

  // Porcentagem paga
  const paidPercent =
    financialSummary.totalExpected > 0
      ? Math.round((financialSummary.totalPaid / financialSummary.totalExpected) * 100)
      : 0;

  // Contas pendentes do mês atual para acesso rápido
  const pendingAccounts = useMemo(() => {
    return monthlyAccounts.filter((a) => a.status === 'pendente');
  }, [monthlyAccounts]);

  // Parcelamentos próximos do fim (mostra até 3 por padrão)
  const endingInstallments = financialSummary.activeEndingInstallments || [];
  const displayedInstallments = showAllEnding ? endingInstallments : endingInstallments.slice(0, 3);

  // Total a ser liberado após o término das parcelas próximas do fim
  const monthlyReliefAmount = useMemo(() => {
    return endingInstallments.reduce((acc, curr) => acc + curr.amount, 0);
  }, [endingInstallments]);

  return (
    <div className="dashboard-page max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      {/* 1. Header do Dashboard: Acolhedor, Pessoal e Humano */}
      <section className="welcome-banner" aria-labelledby="welcome-title">
        <div className="welcome-copy">
          <div className="text-xs sm:text-sm font-semibold text-brand flex items-center gap-1.5 mb-1">
            <span>OLÁ, QUE BOM TER VOCÊ POR AQUI.</span>

          </div>

          <h2 id="welcome-title" className="font-bold text-stone-900">
            {financialSummary.pendingCount === 0
              ? 'Tudo pago por aqui'
              : paidPercent >= 90
              ? 'O mês está quase concluído'
              : financialSummary.pendingCount === 1
              ? 'Falta apenas 1 conta para fechar o mês'
              : `Faltam ${financialSummary.pendingCount} contas para fechar o mês`}
          </h2>

          <p className="text-xs sm:text-sm text-stone-600 mt-1">
            {financialSummary.pendingCount === 0
              ? 'Todas as contas e faturas deste mês já estão quitadas.'
              : `${financialSummary.pendingCount} de ${financialSummary.totalCount} contas ainda aguardam quitação`}
            {endingInstallments.length > 0 && (
              <span className="text-stone-500">
                {' '}• {endingInstallments.length} {endingInstallments.length === 1 ? 'parcelamento termina em breve' : 'parcelamentos terminam em breve'}.
              </span>
            )}
          </p>
        <div className="welcome-actions">
          <div className="hero-progress">
            <div className="hero-progress-label"><span>Seu mês, passo a passo</span><strong>{paidPercent}% concluído</strong></div>
            <div className="hero-progress-track" role="progressbar" aria-label="Progresso de pagamento do mês" aria-valuemin={0} aria-valuemax={100} aria-valuenow={paidPercent}>
              <div className="hero-progress-fill" style={{ width: `${paidPercent}%` }} />
            </div>
          </div>

          <button
            id="btn-goto-accounts"
            type="button"
            onClick={() => setActiveTab('accounts')}
            className="hero-cta"
          >
            <span>Ver contas</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <span className="hero-orbit hero-orbit-blue" />
          <span className="hero-orbit hero-orbit-coral" />
          <div className="hero-portrait"><TatuIllustration className="hero-mascot" /></div>
          <span className="hero-art-caption">Cada conta em seu lugar.<br /><strong>Mais leveza no seu dia.</strong></span>
        </div>
      </section>

      <div className="editorial-note"><span>SEU MÊS EM PERSPECTIVA</span><p>Um mês organizado é um futuro mais leve.</p></div>

      {/* 2. Resumo Financeiro: Três indicadores integrados em uma única área horizontal */}
      <div className="summary-grid">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Bloco 1: TOTAL PREVISTO */}
          <div className="summary-card summary-total p-5 sm:p-6 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wider">
                <span className="inline-flex items-center gap-2"><Layers className="summary-icon" aria-hidden="true" />Total Previsto</span>
              </span>
              <span className="text-[11px] font-semibold text-stone-600 bg-stone-100 px-2 py-0.5 rounded-full">
                {financialSummary.totalCount} {financialSummary.totalCount === 1 ? 'conta' : 'contas'}
              </span>
            </div>

            <div className="text-2xl sm:text-3xl font-bold tracking-tight text-stone-900 pt-0.5">
              {formatBRL(financialSummary.totalExpected)}
            </div>

            <div className="text-xs text-stone-500 flex items-center gap-1.5 pt-1">
              {monthDiff === 0 ? (
                <span>Mesmo valor do mês anterior</span>
              ) : monthDiff > 0 ? (
                <span className="inline-flex items-center gap-1 text-stone-600 font-medium">
                  <TrendingUp className="w-3.5 h-3.5 text-stone-400" />
                  +{formatBRL(monthDiff)} vs {formatMonthYear(previousMonth)}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                  <TrendingDown className="w-3.5 h-3.5 text-emerald-600" />
                  -{formatBRL(Math.abs(monthDiff))} vs {formatMonthYear(previousMonth)}
                </span>
              )}
            </div>
          </div>

          {/* Bloco 2: AINDA PENDENTE */}
          <div className={`summary-card summary-pending p-5 sm:p-6 space-y-2 transition-colors ${
            financialSummary.totalPending > 0 ? 'pending-emphasis' : ''
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-amber-900 uppercase tracking-wider">
                <span className="inline-flex items-center gap-2"><Circle className="summary-icon" aria-hidden="true" />Ainda Pendente</span>
              </span>
              {financialSummary.pendingCount > 0 ? (
                <span className="text-[11px] font-bold text-amber-800 bg-amber-100/90 px-2 py-0.5 rounded-full border border-amber-200/70">
                  {financialSummary.pendingCount} a pagar
                </span>
              ) : (
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/60">
                  Tudo quitado
                </span>
              )}
            </div>

            <div className="text-2xl sm:text-3xl font-bold tracking-tight text-amber-950 pt-0.5">
              {formatBRL(financialSummary.totalPending)}
            </div>

            <div className="text-xs text-stone-500 pt-1">
              {financialSummary.previousPendingCardsTotal > 0 ? (
                <div className="text-amber-900 font-semibold flex items-center justify-between">
                  <span>+ Faturas anteriores:</span>
                  <span className="font-bold text-amber-950 ml-1">
                    +{formatBRL(financialSummary.previousPendingCardsTotal)}
                  </span>
                </div>
              ) : financialSummary.totalPending === 0 ? (
                <span className="text-emerald-700 font-medium">Nenhum pagamento pendente no momento</span>
              ) : (
                <span>{financialSummary.pendingCount} {financialSummary.pendingCount === 1 ? 'conta aguarda quitação' : 'contas aguardam quitação'}</span>
              )}
            </div>
          </div>

          {/* Bloco 3: TOTAL PAGO */}
          <div className="summary-card summary-paid p-5 sm:p-6 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-emerald-900 uppercase tracking-wider">
                <span className="inline-flex items-center gap-2"><CheckCircle2 className="summary-icon" aria-hidden="true" />Total Pago</span>
              </span>
              <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100/90 px-2 py-0.5 rounded-full border border-emerald-200/80">
                {paidPercent}% concluído
              </span>
            </div>

            <div className="text-2xl sm:text-3xl font-bold tracking-tight text-emerald-900 pt-0.5">
              {formatBRL(financialSummary.totalPaid)}
            </div>

            {/* Barra de progresso do mês: 0% --- {paidPercent}% --- 100% */}
            <div className="pt-2">
              <div className="w-full bg-stone-200/70 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-emerald-600 h-2 rounded-full transition-all duration-500 shadow-2xs"
                  style={{ width: `${paidPercent}%` }}
                />
              </div>
              <div className="flex justify-between items-center text-[11px] text-stone-400 mt-1.5 font-medium">
                <span>0%</span>
                <span className="font-semibold text-emerald-800">
                  {financialSummary.paidCount} quitadas ({paidPercent}%)
                </span>
                <span>100%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Duas Colunas: Contas Pendentes do Mês & Parcelamentos Próximos do Fim */}
      <div className="dashboard-panels grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Coluna Esquerda: Contas Pendentes do Mês (7 colunas) */}
        <div className="pending-panel lg:col-span-7 bg-white border border-line rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-stone-900 tracking-tight">
                Contas pendentes deste mês
              </h3>
              <p className="text-xs text-stone-500 mt-0.5">
                Itens que ainda aguardam pagamento ou conferência em {formatMonthYear(currentMonth)}
              </p>
            </div>
            {pendingAccounts.length > 0 && (
              <span className="text-xs font-semibold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200/70">
                {pendingAccounts.length} pendentes
              </span>
            )}
          </div>

          {pendingAccounts.length === 0 ? (
            <div className="py-10 text-center space-y-2 border border-dashed border-line rounded-xl bg-surface-soft/60">
              <CheckCircle2 className="w-7 h-7 text-emerald-600 mx-auto" />
              <div className="text-sm font-semibold text-stone-800">
                Tudo em dia para este mês!
              </div>
              <p className="text-xs text-stone-500 max-w-sm mx-auto">
                Todas as contas e faturas de {formatMonthYear(currentMonth)} já foram marcadas como pagas.
              </p>
            </div>
          ) : (
            <div className="pending-list space-y-2 pt-1">
              {pendingAccounts.slice(0, 5).map((acc) => (
                <div
                  key={acc.id}
                  className="p-3 bg-surface-soft/70 hover:bg-surface-muted rounded-xl border border-line flex items-center justify-between gap-3 transition-colors text-xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      type="button"
                      onClick={() => toggleAccountStatus(acc)}
                      title="Marcar como pago"
                      className="w-5 h-5 rounded-lg border-2 border-stone-300 hover:border-emerald-600 hover:bg-emerald-50 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                    >
                      <span className="sr-only">Marcar {acc.name} como pago</span>
                    </button>
                    <div className="min-w-0">
                      <div className="font-semibold text-stone-800 truncate">
                        {acc.name}
                      </div>
                      <div className="text-[11px] text-stone-500 flex items-center gap-1.5 mt-0.5">
                        {acc.category && (
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: categoryDisplayColor(acc.category.color) }}
                          />
                        )}
                        <span>{acc.category?.name || 'Geral'}</span>
                        <span>•</span>
                        <span className="capitalize">
                          {acc.type === 'credit_card'
                            ? 'Fatura de Cartão'
                            : acc.type === 'installment'
                            ? `Parcela ${acc.installmentInfo?.currentInstallment}/${acc.installmentInfo?.totalInstallments}`
                            : acc.type === 'recurring'
                            ? 'Fixa'
                            : 'Simples'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="font-bold text-stone-900 text-sm">
                      {formatBRL(acc.amount)}
                    </div>
                  </div>
                </div>
              ))}

              {pendingAccounts.length > 5 && (
                <div className="pt-2 text-center">
                  <button
                    type="button"
                    onClick={() => setActiveTab('accounts')}
                    className="text-xs text-brand hover:text-brand-strong font-semibold hover:underline cursor-pointer"
                  >
                    Ver mais {pendingAccounts.length - 5} contas pendentes na lista →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Coluna Direita: Parcelamentos Próximos do Fim (5 colunas) */}
        <div className="installments-panel lg:col-span-5 bg-lilac-soft border border-line rounded-2xl p-5 sm:p-6 shadow-sm space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-brand/10 text-brand">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-stone-900 tracking-tight">
                  Parcelamentos próximos do fim
                </h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  Compras com até 3 parcelas restantes
                </p>
              </div>
            </div>

            <div className="mt-3.5 space-y-2">
              {endingInstallments.length === 0 ? (
                <div className="py-8 text-center text-xs text-stone-400 border border-dashed border-line rounded-xl bg-surface-soft/50">
                  Nenhum parcelamento terminando nos próximos meses.
                </div>
              ) : (
                displayedInstallments.map((inst) => (
                  <div
                    key={inst.purchaseId}
                    className="p-3 rounded-xl border border-line bg-surface-soft/70 flex items-center justify-between gap-3 text-xs hover:bg-surface-muted transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-stone-900 truncate">
                        {inst.description}
                      </div>
                      <div className="text-stone-500 mt-0.5 flex items-center gap-1.5 flex-wrap text-[11px]">
                        <span className="font-semibold text-stone-700 bg-stone-200/70 px-1.5 py-0.2 rounded">
                          {inst.currentInstallment}/{inst.totalInstallments}
                        </span>
                        <span className="text-stone-600 font-medium">
                          Termina em {formatMonthEnd(inst.endMonth)}
                        </span>
                        {inst.cardName && (
                          <span className="text-stone-400">({inst.cardName})</span>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="font-bold text-stone-900">
                        {formatBRL(inst.amount)}
                      </div>
                      <div className="text-[10px] text-brand font-semibold">
                        {inst.remaining === 1 ? 'Última parcela' : `Faltam ${inst.remaining}`}
                      </div>
                    </div>
                  </div>
                ))
              )}

              {endingInstallments.length > 3 && (
                <button
                  type="button"
                  onClick={() => setShowAllEnding(!showAllEnding)}
                  className="w-full py-1.5 text-xs text-stone-600 hover:text-brand font-medium flex items-center justify-center gap-1 cursor-pointer transition-colors"
                >
                  <span>
                    {showAllEnding
                      ? 'Ver menos'
                      : `Ver todos os ${endingInstallments.length} parcelamentos`}
                  </span>
                  {showAllEnding ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>
              )}
            </div>
          </div>

          {endingInstallments.length > 0 && monthlyReliefAmount > 0 && (
            <div className="pt-3 border-t border-line text-[11px] text-stone-500 flex items-center gap-2 mt-3">
              <PiggyBank className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                Ao quitarem estes itens, <strong className="text-stone-800 font-semibold">{formatBRL(monthlyReliefAmount)}</strong> ficarão livres no orçamento mensal.
              </span>
            </div>
          )}
        </div>

      {/* 4. Distribuição Visual Simples dos Principais Gastos (Sem excesso de gráficos) */}
      <div className="categories-panel bg-white border border-line rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
        <div>
          <h3 className="text-sm sm:text-base font-bold text-stone-900 tracking-tight">
            Distribuição dos gastos por categoria
          </h3>
          <p className="text-xs text-stone-500 mt-0.5">
            Participação de cada categoria no total previsto de {formatMonthYear(currentMonth)}
          </p>
        </div>

        {financialSummary.categoryBreakdown.length === 0 ? (
          <div className="py-6 text-center text-xs text-stone-400">
            Nenhuma despesa categorizada neste mês.
          </div>
        ) : (
          <div className="category-list grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3.5 pt-1">
            {financialSummary.categoryBreakdown.map((cat) => (
              <div key={cat.categoryId} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs"
                      style={{ backgroundColor: categoryDisplayColor(cat.categoryColor) }}
                    />
                    <span className="font-medium text-stone-800">
                      {cat.categoryName}
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="font-bold text-stone-900">
                      {formatBRL(cat.total)}
                    </span>
                    <span className="text-stone-400 w-8 text-right text-[11px] font-semibold">
                      {cat.percentage}%
                    </span>
                  </div>
                </div>
                {/* Linha de progresso fina e discreta */}
                <div className="w-full bg-surface-muted rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-1.5 rounded-full transition-all duration-300"
                    style={{
                      width: `${cat.percentage}%`,
                      backgroundColor: categoryDisplayColor(cat.categoryColor),
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
    </div>
  );
};

