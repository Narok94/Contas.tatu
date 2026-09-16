import { categoryDisplayColor } from '../utils/categoryPalette';
import React from 'react';
import { CheckCircle2, Circle, Edit3, Trash2, Repeat, Layers, Plus } from 'lucide-react';
import { UnifiedMonthlyAccount } from '../types/finance';
import { formatBRL, formatMonthEnd } from '../utils/formatters';
import { getCategoryOrTypeIcon } from '../utils/iconHelper';

interface AccountCardProps {
  account: UnifiedMonthlyAccount;
  onToggleStatus: (account: UnifiedMonthlyAccount) => void;
  onEdit: (account: UnifiedMonthlyAccount) => void;
  onDelete: (account: UnifiedMonthlyAccount) => void;
}

export const AccountCard: React.FC<AccountCardProps> = ({
  account,
  onToggleStatus,
  onEdit,
  onDelete,
}) => {
  const isPaid = account.status === 'pago';
  const isRecurring = account.type === 'recurring';
  const isInstallment = account.type === 'installment';
  const isZeroValueRecurring = isRecurring && account.amount === 0;

  // Renderiza etiqueta de tipo
  const renderTypeBadge = () => {
    if (isRecurring) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-blue-50/90 px-1.5 py-0.5 rounded-md border border-blue-200/70">
          <Repeat className="w-2.5 h-2.5" />
          Fixa
        </span>
      );
    }
    if (isInstallment && account.installmentInfo) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-700 bg-purple-50/90 px-1.5 py-0.5 rounded-md border border-purple-200/70">
          <Layers className="w-2.5 h-2.5" />
          {account.installmentInfo.currentInstallment}/{account.installmentInfo.totalInstallments}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-stone-600 bg-stone-100/90 px-1.5 py-0.5 rounded-md border border-stone-200/60">
        Simples
      </span>
    );
  };

  return (
    <div
      id={`account-card-${account.id}`}
      className={`account-tile group relative rounded-2xl border transition-all duration-200 self-start h-fit shadow-xs hover:shadow-sm ${
        isPaid
          ? 'bg-success-soft border-line border-l-2 border-l-emerald-500'
          : isZeroValueRecurring
          ? 'bg-white border-amber-300 border-l-4 border-l-amber-400'
          : 'bg-white border-line border-l-4 border-l-amber-500 hover:border-line-strong'
      }`}
    >
      <div className="p-3.5 sm:p-4">
        {/* Linha Superior: Ícone pequeno, tipo, categoria/tag e status à direita */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            {/* Ícone linear minimalista da categoria ou tipo */}
            <div
              className="category-chip w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{
                '--category-color': categoryDisplayColor(account.category?.color || 'var(--color-brand)'),
              } as React.CSSProperties}
              title={account.category?.name || account.type}
            >
              {getCategoryOrTypeIcon(account.category?.name, account.type, 'w-3.5 h-3.5')}
            </div>

            {renderTypeBadge()}

            {account.category && (
              <span
                className="category-chip inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-md truncate max-w-[120px]"
                style={{
                  '--category-color': categoryDisplayColor(account.category.color),
                } as React.CSSProperties}
              >
                {account.category.name}
              </span>
            )}
          </div>

          {/* Status Badge */}
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

        {/* Centro: Nome da Conta */}
        <h3
          title={account.name}
          className="text-sm font-bold tracking-tight text-stone-900 leading-snug line-clamp-1"
        >
          {account.name}
        </h3>

        {/* Centro: Valor Principal */}
        <div className="mt-1.5">
          {isZeroValueRecurring ? (
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold tracking-tight text-amber-700">
                {formatBRL(0)}
              </span>
              <span className="text-[11px] text-amber-700/80 font-medium">
                (Aguardando valor do mês)
              </span>
            </div>
          ) : (
            <div>
              <div className="flex items-baseline gap-1.5">
                <span
                  className={`text-xl sm:text-2xl font-bold tracking-tight ${
                    isPaid ? 'text-stone-800' : 'text-stone-900'
                  }`}
                >
                  {formatBRL(account.amount)}
                </span>
                {isInstallment && (
                  <span className="text-xs font-normal text-stone-500">
                    / parcela
                  </span>
                )}
              </div>
              {/* Informação secundária para parcelamentos */}
              {isInstallment && account.installmentInfo && (
                <div className="text-[11px] text-stone-500 mt-0.5 font-normal">
                  Total da compra:{' '}
                  <span className="font-semibold text-stone-700">
                    {formatBRL(
                      account.installmentInfo.totalAmount ||
                        account.amount * account.installmentInfo.totalInstallments
                    )}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Informações Secundárias: Parcelamento ou Fixa */}
        {isInstallment && account.installmentInfo && (
          <div className="mt-1.5 text-[11px] text-stone-500 font-medium flex items-center gap-1.5 flex-wrap">
            <span>
              {account.installmentInfo.remainingInstallments === 0
                ? 'Última parcela'
                : `Falta ${account.installmentInfo.remainingInstallments}`}
            </span>
            <span>•</span>
            <span className="text-stone-600 font-semibold">
              Fim: {formatMonthEnd(account.installmentInfo.endMonth)}
            </span>
          </div>
        )}

        {isRecurring && !isZeroValueRecurring && (
          <div className="mt-1 text-[11px] text-stone-400">
            Conta fixa mensal recorrente
          </div>
        )}
      </div>

      {/* Rodapé: Botão de ação (Terracota se pendente, discreto se pago) + Editar + Excluir */}
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
            onClick={() => onToggleStatus(account)}
            title="Clique para marcar como pendente se necessário"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-emerald-800 bg-emerald-100/70 hover:bg-emerald-200/80 transition-colors cursor-pointer"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>✓ Pago</span>
          </button>
        ) : (
          <button
            id={`btn-toggle-${account.id}`}
            type="button"
            onClick={() => onToggleStatus(account)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-brand hover:bg-brand-strong text-white shadow-2xs hover:shadow-xs transition-all cursor-pointer active:scale-[0.98]"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Marcar como pago</span>
          </button>
        )}

        {/* Secondary Actions: Edit & Delete */}
        <div className="flex items-center gap-0.5">
          <button
            id={`btn-edit-${account.id}`}
            type="button"
            onClick={() => onEdit(account)}
            title="Editar informações da conta"
            className="p-1.5 text-stone-400 hover:text-stone-800 hover:bg-stone-200/50 rounded-lg transition-colors cursor-pointer"
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          <button
            id={`btn-delete-${account.id}`}
            type="button"
            onClick={() => onDelete(account)}
            title="Excluir conta"
            className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
