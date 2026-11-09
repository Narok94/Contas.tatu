import { useRef, useState, type FormEvent } from 'react';
import { Check } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { createChatApi } from '../services/chatApi';
import { createFinanceApi } from '../services/financeApi';
import { formatBRL, formatMonthYear } from '../utils/formatters';
import { PAYMENT_METHODS, type GuidedExpense, type PaymentMethod } from './conversation';
import { parseMobileMoney } from './model';

const chat = createChatApi();
const finance = createFinanceApi();
const installments = Array.from({ length: 119 }, (_, index) => index + 2);

function Choices<T extends string>({ label, options, value, onChange }: {
  label: string; options: readonly T[]; value?: T; onChange: (value: T) => void;
}) {
  return <fieldset className="mobile-flow-choices">
    <legend>{label}</legend>
    <div>{options.map(option => <button key={option} type="button" aria-pressed={option === value}
      onClick={() => onChange(option)}>{option}</button>)}</div>
  </fieldset>;
}

export function GuidedExpenseSummary({ expense }: { expense: GuidedExpense }) {
  return <dl className="mobile-flow-summary">
    <div><dt>Produto</dt><dd>{expense.name}</dd></div>
    <div><dt>Estabelecimento</dt><dd>{expense.location}</dd></div>
    <div><dt>Valor da compra</dt><dd>{formatBRL(expense.amount)}</dd></div>
    <div><dt>Mês do lançamento</dt><dd>{formatMonthYear(expense.month)}</dd></div>
    <div><dt>Status</dt><dd>{expense.paymentMethod ? 'Pago' : 'Pendente'}</dd></div>
    {expense.paymentMethod && <div><dt>Pagamento</dt><dd>{expense.paymentMethod}</dd></div>}
    {expense.paymentMethod === 'Crédito' && <div><dt>Parcelamento</dt><dd>{expense.count === 1 ? 'À vista' : `${expense.count}x`}</dd></div>}
  </dl>;
}

export function GuidedExpenseFlow({ onSuccess, onSaving }: { onSuccess: () => void; onSaving: (busy: boolean) => void }) {
  const f = useFinance();
  const [id] = useState(() => crypto.randomUUID());
  const [month] = useState(f.currentMonth);
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [value, setValue] = useState('');
  const [paid, setPaid] = useState<'Sim' | 'Não'>();
  const [method, setMethod] = useState<PaymentMethod>();
  const [credit, setCredit] = useState<'À vista' | 'Parcelado'>();
  const [count, setCount] = useState(2);
  const [preview, setPreview] = useState<GuidedExpense>();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const card = paid === 'Sim' && method === 'Crédito';
  const blocked = Boolean(f.store.closedMonths?.[month]);

  function review(event: FormEvent) {
    event.preventDefault();
    const amount = parseMobileMoney(value);
    if (!name.trim() || !location.trim() || amount === null || !paid || (paid === 'Sim' && !method) || (card && !credit)) {
      setError('Confira os campos, o valor e as opções de pagamento.');
      return;
    }
    setError('');
    setPreview({ name: name.trim(), location: location.trim(), month, amount,
      count: card && credit === 'Parcelado' ? count : 1, paymentMethod: paid === 'Sim' ? method : undefined });
  }

  async function save() {
    if (!preview || lock.current || !f.ready || f.busy || blocked) return;
    if (preview.paymentMethod === 'Crédito' && !f.creditCards.length) {
      setError('Cadastre um cartão pelo computador para adicionar esta compra.');
      return;
    }
    lock.current = true;
    setSaving(true);
    onSaving(true);
    setError('');
    try {
      const view = await finance.read(month);
      await chat.confirmGuided(id, view.revision, preview);
      f.refresh();
      onSuccess();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar a compra. Tente novamente.');
    } finally {
      lock.current = false;
      setSaving(false);
      onSaving(false);
    }
  }

  return <>
    {blocked && <p className="mobile-error" role="alert">Este mês está fechado.</p>}
    {f.operationError && <p className="mobile-error" role="alert">{f.operationError}{' '}<button type="button" onClick={f.refresh}>Atualizar dados</button></p>}
    {error && <p className="mobile-error" role="alert">{error}</p>}
    {preview ? <div className="mobile-flow-form">
      <h3>Confira antes de adicionar</h3>
      <GuidedExpenseSummary expense={preview} />
      <button type="button" className="mobile-primary" disabled={saving || f.busy || !f.ready || blocked} onClick={() => void save()}>
        <Check size={18} />{saving ? 'Salvando…' : 'Adicionar compra'}
      </button>
      <button type="button" className="mobile-secondary" disabled={saving} onClick={() => { setError(''); setPreview(undefined); }}>Corrigir</button>
    </div> : <form className="mobile-flow-form" onSubmit={review}>
      <label className="mobile-field">O que você comprou?<input value={name} maxLength={160} required onChange={e => setName(e.target.value)} /></label>
      <label className="mobile-field">Onde comprou?<input value={location} maxLength={160} required onChange={e => setLocation(e.target.value)} /></label>
      <label className="mobile-field">Valor da compra<input value={value} maxLength={16} required inputMode="decimal" placeholder="R$ 0,00" onChange={e => setValue(e.target.value)} /></label>
      <Choices label="Já foi pago?" options={['Sim', 'Não']} value={paid} onChange={setPaid} />
      {paid === 'Sim' && <Choices label="Como pagou?" options={PAYMENT_METHODS} value={method} onChange={setMethod} />}
      {card && <Choices label="Parcelamento" options={['À vista', 'Parcelado']} value={credit} onChange={setCredit} />}
      {card && credit === 'Parcelado' && <label className="mobile-field">Quantidade de parcelas<select value={count} onChange={e => setCount(Number(e.target.value))}>
        {installments.map(quantity => <option key={quantity} value={quantity}>{quantity}x</option>)}
      </select></label>}
      <button type="submit" className="mobile-primary">Revisar compra</button>
    </form>}
  </>;
}
