import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, CreditCard, Layers, ReceiptText } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { openAmount, roundPayment } from '../domain/paymentBalances';
import type { UnifiedMonthlyAccount } from '../types/finance';
import { addMonths, formatBRL, formatMonthYear } from '../utils/formatters';
import { parseMobileMoney } from './model';

const keyOf = (account: UnifiedMonthlyAccount) => `${account.type}:${account.id}`;

function AccountIcon({ account }: { account: UnifiedMonthlyAccount }) {
  const Icon = account.type === 'credit_card' ? CreditCard : account.type === 'installment' ? Layers : ReceiptText;
  return <span className="mobile-entry-icon" style={{ color: account.category?.color ?? '#24704e' }}><Icon size={21} /></span>;
}

export function MobilePaymentFlow({ onSuccess }: { onSuccess: () => void }) {
  const f = useFinance();
  const [selected, setSelected] = useState<string>();
  const [reviewing, setReviewing] = useState(false);
  const [mode, setMode] = useState<'total' | 'partial'>();
  const [value, setValue] = useState('');
  const [transfer, setTransfer] = useState<boolean>();
  const request = useRef<{ key: string; id: string }>();
  const locked = useRef(false);
  const month = f.currentMonth;
  const closed = Boolean(f.store.closedMonths?.[month]);
  const nextMonth = addMonths(month, 1);
  const nextClosed = Boolean(f.store.closedMonths?.[nextMonth]);
  const accounts = f.hasCurrentView ? f.monthlyAccounts.filter(account => openAmount(account) > 0) : [];
  const account = accounts.find(row => keyOf(row) === selected);
  const balance = account ? openAmount(account) : 0;
  const paid = mode === 'partial' ? parseMobileMoney(value) : balance;
  const remaining = paid === null ? null : roundPayment(balance - paid);
  const valid = mode === 'total' || (paid !== null && remaining !== null && remaining > 0 && transfer !== undefined && !(transfer && nextClosed));

  useEffect(() => {
    if (!f.busy && request.current && f.store.mobilePayments?.some(payment => payment.id === request.current?.id)) onSuccess();
  }, [f.busy, f.store.mobilePayments, onSuccess]);

  function resetReview() {
    setReviewing(false);
    setMode(undefined);
    setValue('');
    setTransfer(undefined);
    f.clearOperationError();
  }

  async function confirm() {
    if (locked.current || !account || !mode || paid === null || !valid || closed || !f.ready || f.busy || !f.submitFinancialCommand) return;
    const data = { id: account.id, type: account.type, amount: paid, expectedOpen: balance, transfer: mode === 'partial' && transfer === true };
    const key = JSON.stringify({ month, ...data });
    if (request.current?.key !== key) request.current = { key, id: crypto.randomUUID() };
    locked.current = true;
    try {
      if (await f.submitFinancialCommand('payment.mobile', { requestId: request.current.id, ...data }, month)) onSuccess();
    } finally {
      locked.current = false;
    }
  }

  return <div className="mobile-flow-form">
    {f.operationError && <div className="mobile-error" role="alert">{f.operationError}{' '}
      <button type="button" onClick={f.refresh}>Atualizar dados</button>
    </div>}
    {closed && <p className="mobile-error" role="alert">Este mês está fechado.</p>}
    {reviewing && account ? <>
      <div className="mobile-entry">
        <AccountIcon account={account} />
        <span className="mobile-entry-copy"><b>{account.name}</b><small>Valor em aberto de {formatBRL(balance)}</small></span>
      </div>
      <fieldset className="mobile-pay-options" disabled={f.busy}>
        <legend>Como foi o pagamento?</legend>
        <label className="mobile-pay-option"><input type="radio" name="payment-mode" checked={mode === 'total'} onChange={() => setMode('total')} />
          <span><b>Pagamento total</b><small>Pagar todo o valor ({formatBRL(balance)})</small></span>
        </label>
        <label className="mobile-pay-option"><input type="radio" name="payment-mode" checked={mode === 'partial'} onChange={() => setMode('partial')} />
          <span><b>Pagamento parcial</b><small>Pagar apenas uma parte</small></span>
        </label>
      </fieldset>
      {mode === 'partial' && <>
        <label className="mobile-field">Valor pago
          <input value={value} disabled={f.busy} inputMode="decimal" maxLength={16} placeholder="R$ 0,00" onChange={e => setValue(e.target.value)} />
          {value && (remaining === null || remaining <= 0) && <small>Informe um valor maior que zero e menor que o saldo em aberto.</small>}
        </label>
        {remaining !== null && remaining > 0 && <fieldset className="mobile-pay-options" disabled={f.busy}>
          <legend>Transferir o saldo restante para {formatMonthYear(nextMonth)}?</legend>
          <label className="mobile-pay-option"><input type="radio" name="payment-transfer" checked={transfer === true} disabled={nextClosed} onChange={() => setTransfer(true)} />Sim, transferir</label>
          <label className="mobile-pay-option"><input type="radio" name="payment-transfer" checked={transfer === false} onChange={() => setTransfer(false)} />Não, manter neste mês</label>
          {nextClosed && <small>O próximo mês está fechado.</small>}
        </fieldset>}
      </>}
      {mode && paid !== null && remaining !== null && remaining >= 0 && <div className="mobile-payment-summary">
        <h3>Resumo do pagamento</h3>
        <dl className="mobile-flow-summary">
          <div><dt>Conta</dt><dd>{account.name}</dd></div>
          <div><dt>Valor pago</dt><dd>{formatBRL(paid)}</dd></div>
          <div><dt>Saldo restante</dt><dd>{formatBRL(remaining)}</dd></div>
          {remaining > 0 && transfer !== undefined && <div><dt>Saldo em</dt><dd>{formatMonthYear(transfer ? nextMonth : month)}</dd></div>}
        </dl>
      </div>}
      <button type="button" className="mobile-primary" disabled={!mode || !valid || !f.ready || f.busy || closed} onClick={() => void confirm()}>
        <Check size={18} />{f.busy ? 'Salvando…' : 'Confirmar pagamento'}
      </button>
      <button type="button" className="mobile-secondary" disabled={f.busy} onClick={resetReview}><ArrowLeft size={16} /> Escolher outra conta</button>
    </> : <>
      <label className="mobile-field">Mês das contas
        <input type="month" value={month} disabled={f.busy} onChange={e => {
          if (/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value)) {
            resetReview();
            setSelected(undefined);
            f.setCurrentMonth(e.target.value);
          }
        }} />
      </label>
      {f.loading ? <p role="status">Buscando contas…</p> : accounts.length > 0 ?
        <fieldset className="mobile-pay-options" disabled={!f.ready || closed}>
          <legend>Qual conta você quer pagar?</legend>
          {accounts.map(row => <label className="mobile-entry mobile-pay-account" key={keyOf(row)}>
            <AccountIcon account={row} />
            <span className="mobile-entry-copy"><b>{row.name}</b>{row.category && <small>{row.category.name}</small>}</span>
            <strong className="mobile-entry-value">{formatBRL(openAmount(row))}</strong>
            <input type="radio" name="payment-account" checked={selected === keyOf(row)} onChange={() => setSelected(keyOf(row))} />
          </label>)}
        </fieldset> : f.ready && <p className="mobile-empty">{reviewing ? 'O saldo da conta foi atualizado.' : 'Nenhuma conta com saldo em aberto neste mês.'}</p>}
      {accounts.length > 0 && <button type="button" className="mobile-primary" disabled={!account || !f.ready || f.busy || closed} onClick={() => setReviewing(true)}>Continuar</button>}
    </>}
  </div>;
}
