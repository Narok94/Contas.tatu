import React, { useRef, useState } from 'react';
import { Check, CreditCard, Layers, ReceiptText } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { ACCESS_MESSAGE, ADMIN_MESSAGE, parseMobileMoney, type MobileEntry } from './model';
import { formatBRL, formatMonthYear } from '../utils/formatters';
import type { Preview } from './conversation';

export type EntryKind = 'account' | 'card' | 'installment';
export interface EntrySuccess { name: string; amount: number; title: string; preview?: Preview }
export const MobileEntryForm: React.FC<{ kind: EntryKind; editing?: MobileEntry; initial?: Preview; onConfirm?: (preview: Preview) => Promise<boolean>; onSuccess: (value: EntrySuccess) => void }> = ({ kind, editing, initial, onConfirm, onSuccess }) => {
  const f = useFinance();
  const [name, setName] = useState(editing?.name ?? initial?.name ?? '');
  const [value, setValue] = useState(editing || initial ? String((editing ?? initial)!.amount).replace('.', ',') : '');
  const [categoryId, setCategoryId] = useState(editing?.categoryId ?? initial?.categoryId ?? '');
  const [month, setMonth] = useState(editing?.month ?? initial?.month ?? f.currentMonth);
  const [paid, setPaid] = useState(editing?.paid ?? initial?.paid ?? false);
  const [card, setCard] = useState(initial?.cardId ?? f.creditCards[0]?.id ?? '');
  const [linkedCard, setLinkedCard] = useState(initial?.cardId ?? '');
  const [parcelled, setParcelled] = useState(false);
  const [count, setCount] = useState(String(initial?.count ?? 2));
  const [error, setError] = useState('');
  const lock = useRef(false);
  const [sending, setSending] = useState(false);
  const isExpenseEdit = editing?.kind === 'expense';
  const needsCount = !editing && (kind === 'installment' || kind === 'card' && parcelled);
  const label = editing ? 'Salvar alterações' : kind === 'account' ? 'Adicionar conta' : kind === 'card' ? 'Adicionar compra' : 'Adicionar parcelamento';
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (lock.current || f.busy) return;
    setError(''); f.clearOperationError();
    if (!f.ready || !f.submitFinancialCommand) { setError(f.apiErrorStatus === 403 ? ACCESS_MESSAGE : 'Aguarde a conexão com seus dados. Se necessário, volte ao início e tente atualizar.'); return; }
    if (f.store.closedMonths?.[month]) { setError(ADMIN_MESSAGE); return; }
    const amount = parseMobileMoney(value);
    if (!name.trim() || amount === null) { setError('Informe a descrição e um valor maior que zero, com até duas casas decimais.'); return; }
    const installmentsCount = Number(count);
    if (needsCount && (!/^\d+$/.test(count) || !Number.isInteger(installmentsCount) || installmentsCount < 1 || installmentsCount > 120)) { setError('Informe de 1 a 120 parcelas.'); return; }
    if (!editing && kind === 'card' && !f.creditCards.some(c => c.id === card)) { setError('Cadastre um cartão pelo computador para adicionar esta compra.'); return; }
    lock.current = true; setSending(true); (document.activeElement as HTMLElement)?.blur();
    try {
      let action: string; let data: object;
      if (editing) {
        action = isExpenseEdit ? 'expense.edit' : 'simple.edit';
        data = isExpenseEdit ? { id: editing.id, description: name.trim(), amount, categoryId: categoryId || undefined } :
          { id: editing.id, name: name.trim(), value: amount, categoryId: categoryId || undefined, paid };
      } else if (kind === 'account') {
        action = 'simple.create'; data = { name: name.trim(), value: amount, categoryId: categoryId || undefined, paid };
      } else if (kind === 'card' && !parcelled) {
        action = 'expense.create'; data = { cardId: card, description: name.trim(), amount, categoryId: categoryId || undefined };
      } else {
        action = 'installment.create'; data = { description: name.trim(), totalAmount: amount, installmentsCount,
          categoryId: categoryId || undefined, creditCardId: (kind === 'card' ? card : linkedCard) || undefined };
      }
      const cardId = kind === 'card' ? card : kind === 'installment' ? linkedCard : undefined;
      const preview: Preview = { name: name.trim(), amount, month, count: needsCount ? installmentsCount : 1,
        paid: kind === 'account' && paid, cardId: cardId || undefined,
        cardName: f.creditCards.find(c => c.id === cardId)?.name, categoryId: categoryId || undefined };
      const ok = onConfirm ? await onConfirm(preview) : await f.submitFinancialCommand(action, data, month);
      if (ok) {
        const cardId = kind === 'card' ? card : kind === 'installment' ? linkedCard : undefined;
        onSuccess({ name: name.trim(), amount, title: editing ? 'Alterações salvas!' : kind === 'account' ? 'Conta adicionada com sucesso!' : kind === 'card' ? 'Compra adicionada com sucesso!' : 'Parcelamento adicionado!',
          preview: { name: name.trim(), amount, month, count: needsCount ? installmentsCount : 1,
            paid: kind === 'account' && paid, cardId: cardId || undefined,
            cardName: f.creditCards.find(c => c.id === cardId)?.name, categoryId: categoryId || undefined } });
      }
    } finally { lock.current = false; setSending(false); }
  }
  const CategoryField = <label className="mobile-field">Categoria<select value={categoryId} onChange={e => setCategoryId(e.target.value)}><option value="">Sem categoria</option>{f.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>;
  return <form className="mobile-form" onSubmit={submit} aria-label={editing ? 'Edição rápida' : label}>
    <div className="mobile-form-intro"><span className="mobile-kind-icon">{kind === 'account' ? <ReceiptText /> : kind === 'card' ? <CreditCard /> : <Layers />}</span><p>{editing ? 'Só o essencial, do seu jeito.' : 'Poucos detalhes. Tudo no lugar.'}</p></div>
    <label className="mobile-field">Descrição<input name="description" autoComplete="off" maxLength={160} required placeholder={kind === 'account' ? 'Ex.: Mercado' : 'Ex.: Fone de ouvido'} value={name} onChange={e => setName(e.target.value)} enterKeyHint="next" /></label>
    <label className="mobile-field">{needsCount || kind === 'installment' ? 'Valor total' : 'Valor'}<span className="mobile-money"><span aria-hidden="true">R$</span><input name="amount" inputMode="decimal" autoComplete="off" required placeholder="0,00" value={value} onChange={e => setValue(e.target.value)} enterKeyHint="next" /></span></label>
    {kind === 'card' && !editing && <>
      <label className="mobile-field">Cartão<select required value={card} onChange={e => setCard(e.target.value)}><option value="">Selecione um cartão</option>{f.creditCards.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      {!f.creditCards.length && <p className="mobile-hint">Seus cartões aparecerão aqui quando o acesso estiver disponível. O cadastro de cartões é feito pelo computador.</p>}
      <fieldset className="mobile-segment"><legend>Tipo de compra</legend><button type="button" aria-pressed={!parcelled} onClick={() => setParcelled(false)}>À vista</button><button type="button" aria-pressed={parcelled} onClick={() => setParcelled(true)}>Parcelado</button></fieldset>
    </>}
    {needsCount && <label className="mobile-field">Número de parcelas<input name="installments" inputMode="numeric" pattern="[0-9]*" required value={count} onChange={e => setCount(e.target.value)} />{parseMobileMoney(value) !== null && Number(count) > 0 && <small>{count}x de {formatBRL(Math.round(parseMobileMoney(value)! / Number(count) * 100) / 100)}</small>}</label>}
    {CategoryField}
    {kind !== 'card' || editing ? <label className="mobile-field">{kind === 'installment' ? 'Início' : 'Mês'}<input type="month" required value={month} readOnly={!!editing} onChange={e => setMonth(e.target.value)} />{editing && <small>Para mudar o mês, use o Contas Tatu no computador.</small>}</label> : <p className="mobile-hint">Compra em {formatMonthYear(month)}.</p>}
    {kind === 'installment' && <label className="mobile-field">Cartão <small>(opcional)</small><select value={linkedCard} onChange={e => setLinkedCard(e.target.value)}><option value="">Sem cartão · parcelamento independente</option>{f.creditCards.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
    {kind === 'account' && <label className="mobile-toggle"><span><b>Já está paga</b><small>Registrar como pagamento realizado</small></span><input type="checkbox" role="switch" checked={paid} onChange={e => setPaid(e.target.checked)} /><span className="mobile-switch" aria-hidden="true"><Check size={16} /></span></label>}
    {(error || f.operationError) && <p className="mobile-error" role="alert">{error || (f.apiErrorStatus === 403 ? ACCESS_MESSAGE : f.operationError)}</p>}
    <button className="mobile-primary" type="submit" disabled={sending || f.busy}>{sending || f.busy ? 'Salvando…' : label}</button>
    <p className="mobile-footnote">Cada conta em seu lugar.</p>
  </form>;
}
