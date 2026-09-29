import React, { useState } from 'react';
import { useFinance } from '../context/FinanceContext';
import { installmentPayoffQuote } from '../domain/installmentOperations';
import { formatBRL, formatMonthYear } from '../utils/formatters';

export function InstallmentLifecycle({ id, operation, setOperation, reason, setReason, onDone }: {
  id: string; operation: 'change' | 'correct'; setOperation: (value: 'change' | 'correct') => void;
  reason: string; setReason: (value: string) => void; onDone: () => void;
}) {
  const { mode, busy, store, currentMonth, installmentAction } = useFinance();
  const [confirm, setConfirm] = useState<'cancel' | 'payoff' | null>(null);
  if (mode !== 'neon') return null;
  let quote: number | undefined;
  try { quote = installmentPayoffQuote(store, id, currentMonth); } catch { /* Lifecycle unavailable. */ }
  return <div className="p-3 border border-stone-200 rounded-lg space-y-2 text-sm">
    <label className="block">Aplicar edição
      <select aria-label="Alcance da edição" value={operation} onChange={e => setOperation(e.target.value as 'change' | 'correct')}>
        <option value="change">Deste mês em diante</option><option value="correct">Corrigir somente este mês</option>
      </select>
    </label>
    <label className="block">Motivo<input aria-label="Motivo da alteração" required value={reason} onChange={e => setReason(e.target.value)} className="w-full border rounded p-2" /></label>
    <div className="flex gap-3"><button type="button" disabled={busy} onClick={() => setConfirm('cancel')}>Cancelar parcelas futuras</button>
      <button type="button" disabled={busy || quote === undefined} onClick={() => setConfirm('payoff')}>Quitar antecipadamente</button></div>
    {confirm && <div role="group" aria-label="Confirmar operação do parcelamento">
      <p>{confirm === 'cancel' ? `Cancelar a partir de ${formatMonthYear(currentMonth)}, preservando os meses anteriores?` : `Quitar ${formatBRL(quote ?? 0)} em ${formatMonthYear(currentMonth)}? No cartão, a quitação registra o pagamento na fatura.`}</p>
      <button type="button" disabled={busy || !reason.trim()} onClick={async () => { if (await installmentAction?.(id, confirm, reason.trim())) onDone(); }}>Confirmar {confirm === 'cancel' ? 'cancelamento' : 'quitação'}</button>
      <button type="button" onClick={() => setConfirm(null)}>Voltar</button>
    </div>}
  </div>;
}
