import { categoryDisplayColor } from '../utils/categoryPalette';
import React, { useState } from 'react';
import {
  CreditCard as CardIcon,
  Undo2, CheckCircle2,
  Circle,
  Plus,
  Trash2,
  Edit2,
  ChevronDown,
  ChevronUp,
  Layers,
  Edit3,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { CardInternalItem, UnifiedMonthlyAccount } from '../types/finance';
import { formatBRL, formatMonthEnd, formatMonthYear } from '../utils/formatters';

export type { CardInternalItem };

interface CreditCardAccountCardProps {
  account: UnifiedMonthlyAccount;
  onToggleStatus: (account: UnifiedMonthlyAccount) => void;
  onEdit: (account: UnifiedMonthlyAccount) => void;
  onDelete: (account: UnifiedMonthlyAccount) => void;
  onAddPurchase: (cardId: string) => void;
  onEditItem: (item: CardInternalItem) => void;
  onDeleteItem: (
    sourceType: 'simple_expense' | 'installment',
    sourceId: string,
    description: string
  ) => void;
}

export const CreditCardAccountCard: React.FC<CreditCardAccountCardProps> = ({
  account,
  onToggleStatus,
  onEdit,
  onDelete,
  onAddPurchase,
  onEditItem,
  onDeleteItem,
}) => {
  const { paySpecificCardInvoice } = useFinance();
  const [isExpanded, setIsExpanded] = useState(false);
  const isPaid = account.status === 'pago';
  const cardInfo = account.cardInfo;
  const items = (cardInfo?.items || []) as CardInternalItem[];

  const currentMonthAmount = cardInfo?.currentMonthAmount ?? account.amount;
  const previousPendingAmount = cardInfo?.previousPendingAmount ?? 0;
  const previousPendingInvoices = cardInfo?.previousPendingInvoices ?? [];
  const totalOpenAmount = cardInfo?.totalOpenAmount ?? (isPaid ? 0 : account.amount);
  const hasPreviousPending = previousPendingAmount > 0;

  return (
    <div
      id={`credit-card-${account.id}`}
      className={`account-tile group relative rounded-2xl border transition-all duration-200 self-start h-fit shadow-xs hover:shadow-sm ${
        isPaid
          ? 'bg-success-soft border-line border-l-2 border-l-emerald-500'
          : hasPreviousPending
          ? 'bg-white border-amber-300 border-l-4 border-l-amber-500'
          : 'bg-white border-line border-l-4 border-l-amber-500 hover:border-line-strong'
      }`}
    >
      <div className="p-3.5 sm:p-4">
        {/* Header: Tipo Cartão de Crédito + Status Badge */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5">
            <div className="w-8 h-8 rounded-lg bg-info-soft text-info flex items-center justify-center shrink-0">
              <CardIcon className="w-3.5 h-3.5" />
            </div>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-info bg-info-soft px-1.5 py-0.5 rounded-md border border-brand/20">
              Fatura de Cartão
            </span>
          </div>

          {/* Status Badge da fatura do mês atual */}
          <span
            className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border transition-colors shrink-0 ${
              isPaid
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200/80'
                : 'bg-amber-50 text-amber-800 border-amber-200/80'
            }`}
          >
            {isPaid ? (
              <>
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                Pago
              </>
            ) : (
              <>
                <Circle className="w-3 h-3 text-amber-600" />
                Pendente
              </>
            )}
          </span>
        </div>

        {/* Nome do Cartão */}
        <h3
          title={account.name}
          className="text-sm font-bold tracking-tight text-stone-900 truncate"
        >
          {account.name}
        </h3>

        {/* Valor Total da Fatura e Pendências Anteriores */}
        <div className="mt-1.5 space-y-1.5">
          {hasPreviousPending ? (
            <div className="rounded-xl bg-warning-soft border border-amber-200/80 p-2.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-amber-900 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  Total em Aberto
                </span>
                <span className="text-lg font-bold tracking-tight text-amber-950">
                  {formatBRL(totalOpenAmount)}
                </span>
              </div>
              <div className="pt-1.5 border-t border-amber-200/60 space-y-1 text-xs">
                <div className="flex items-center justify-between text-stone-600">
                  <span>Fatura do mês ({isPaid ? 'Paga' : 'Pendente'}):</span>
                  <span className="font-semibold text-stone-800">
                    {formatBRL(currentMonthAmount)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-amber-900">
                  <span>Pendências anteriores:</span>
                  <span className="font-bold text-amber-900">
                    {formatBRL(previousPendingAmount)}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <div
                className={`text-xl sm:text-2xl font-bold tracking-tight ${
                  isPaid ? 'text-stone-800' : 'text-stone-900'
                }`}
              >
                {formatBRL(account.amount)}
              </div>
              <p className="text-[11px] text-stone-500 mt-0.5">
                Total da fatura fechada do mês
              </p>
            </div>
          )}
        </div>

        {/* Botão de Expandir / Recolher Itens */}
        <button
          id={`btn-expand-card-${account.id}`}
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-2 w-full flex items-center justify-between px-2.5 py-1.5 bg-surface-soft hover:bg-surface-muted border border-line rounded-xl text-xs font-medium text-stone-700 transition-colors cursor-pointer"
        >
          <span>
            {isExpanded
              ? 'Ocultar detalhes da fatura'
              : `Ver compras (${items.length})${hasPreviousPending ? ` + ${previousPendingInvoices.length} pendências` : ''}`}
          </span>
          {isExpanded ? (
            <ChevronUp className="w-3.5 h-3.5 text-stone-500" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-stone-500" />
          )}
        </button>
      </div>

      {/* Visão Expandida das Compras Internas e Pendências */}
      {isExpanded && (
        <div className="border-t border-line bg-surface-soft/50 p-3 space-y-3 animate-in slide-in-from-top-1 duration-150">
          {/* Seção 1: Compras do Mês */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-stone-600 uppercase tracking-wider">
                Compras do Mês ({formatBRL(currentMonthAmount)})
              </span>
              <button
                id={`btn-add-expense-to-card-${account.id}`}
                type="button"
                onClick={() => onAddPurchase(cardInfo?.cardId || account.id)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:text-brand-strong transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Adicionar compra
              </button>
            </div>

            {items.length === 0 ? (
              <div className="py-2.5 text-center text-xs text-stone-400 bg-white rounded-lg border border-line">
                Nenhuma compra lançada nesta fatura
              </div>
            ) : (
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-0.5">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-white border border-line text-xs gap-2 group/item hover:border-line-strong transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-stone-800 truncate">
                        {item.description}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {item.isInstallment && item.installmentInfo && (
                          <span className="text-[10px] font-semibold text-brand bg-brand/10 px-1.5 py-0.5 rounded border border-brand/20 inline-flex items-center gap-1">
                            <Layers className="w-2.5 h-2.5" />
                            <span>
                              {item.installmentInfo.current}/{item.installmentInfo.total}
                            </span>
                            {item.installmentInfo.endMonth && (
                              <span className="text-stone-600 font-medium ml-0.5">
                                • Fim: {formatMonthEnd(item.installmentInfo.endMonth)}
                              </span>
                            )}
                          </span>
                        )}
                        {item.category && (
                          <span
                            className="category-chip text-[10px] font-medium px-1.5 py-0.2 rounded"
                            style={{
                              '--category-color': categoryDisplayColor(item.category.color),
                            } as React.CSSProperties}
                          >
                            {item.category.name}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        <span className="font-semibold text-stone-900 block">
                          {formatBRL(item.amount)}
                        </span>
                        {item.isInstallment && item.installmentInfo && (
                          <span className="text-[10px] text-stone-400 block">
                            Total:{' '}
                            {formatBRL(
                              item.installmentInfo.totalAmount ||
                                item.amount * item.installmentInfo.total
                            )}
                          </span>
                        )}
                      </div>
                      {/* Botão de Editar Compra Interna */}
                      <button
                        type="button"
                        title="Editar compra da fatura"
                        onClick={() => onEditItem(item)}
                        className="text-stone-400 hover:text-stone-800 p-1 rounded hover:bg-stone-100 transition-colors cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      {/* Botão de Excluir Compra Interna */}
                      <button
                        type="button"
                        title="Excluir compra da fatura"
                        onClick={() =>
                          onDeleteItem(item.sourceType, item.sourceId, item.description)
                        }
                        className="text-stone-400 hover:text-rose-600 p-1 rounded hover:bg-rose-50 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Seção 2: Pendências de Meses Anteriores (se houver) */}
          {previousPendingInvoices.length > 0 && (
            <div className="pt-2.5 border-t border-amber-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-amber-900 uppercase tracking-wider flex items-center gap-1">
                  <Clock className="w-3 h-3 text-amber-700" />
                  Pendências Anteriores
                </span>
                <span className="text-xs font-bold text-amber-900">
                  {formatBRL(previousPendingAmount)}
                </span>
              </div>
              <div className="space-y-1.5">
                {previousPendingInvoices.map((inv) => (
                  <div
                    key={`past-invoice-${inv.month}`}
                    className="flex items-center justify-between p-2 rounded-lg bg-warning-soft border border-amber-200 text-xs"
                  >
                    <div>
                      <div className="font-semibold text-stone-900 capitalize">
                        {formatMonthYear(inv.month)}
                      </div>
                      <div className="text-[10px] text-amber-800">
                        Fatura não paga naquele mês
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-amber-950">
                        {formatBRL(inv.amount)}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          paySpecificCardInvoice(cardInfo?.cardId || account.id, inv.month)
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-emerald-50 border border-emerald-300 text-emerald-800 text-[11px] font-semibold rounded-md shadow-2xs transition-colors cursor-pointer"
                        title={`Quitar fatura de ${formatMonthYear(inv.month)}`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        Pagar fatura
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Card Action Bar */}
      <div
        className={`px-3.5 py-2 border-t rounded-b-2xl flex items-center justify-between gap-2 ${
          isPaid
            ? 'bg-emerald-50/40 border-emerald-100/80'
            : 'bg-surface-soft border-line'
        }`}
      >
        {/* Toggle Status Action */}
        {isPaid ? (
          <button
            id={`btn-toggle-${account.id}`}
            type="button"
            onClick={event => { if (event.detail < 2) onToggleStatus(account); }}
            title="Clique para reabrir fatura se necessário"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-brand text-xs font-semibold text-brand-strong bg-white hover:bg-teal-soft shadow-xs transition-colors cursor-pointer"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span>Marcar como pendente</span>
          </button>
        ) : (
          <button
            id={`btn-toggle-${account.id}`}
            type="button"
            onClick={event => { if (event.detail < 2) onToggleStatus(account); }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-brand hover:bg-brand-strong text-white shadow-2xs hover:shadow-xs transition-all cursor-pointer active:scale-[0.98]"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Marcar como paga</span>
          </button>
        )}

        {/* Secondary Actions: Edit & Delete Card */}
        <div className="flex items-center gap-0.5">
          <button
            id={`btn-edit-${account.id}`}
            type="button"
            onClick={() => onEdit(account)}
            title="Editar nome do cartão"
            className="p-1.5 text-stone-400 hover:text-stone-800 hover:bg-stone-200/50 rounded-lg transition-colors cursor-pointer"
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          <button
            id={`btn-delete-${account.id}`}
            type="button"
            onClick={() => onDelete(account)}
            title="Excluir cartão e faturas"
            className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
