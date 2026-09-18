import React, { useState } from 'react';
import { useFinance } from '../context/FinanceContext';
import { formatBRL, formatMonthYear } from '../utils/formatters';

export function PaymentDialog() {
  const { paymentRequest, cancelPayment, confirmPayment } = useFinance();
  if (!paymentRequest) return null;
  return <PaymentForm key={`${paymentRequest.month}:${paymentRequest.account.type}:${paymentRequest.account.id}`} request={paymentRequest} cancel={cancelPayment} confirm={confirmPayment} />;
}

const PaymentForm: React.FC<{
  request: NonNullable<ReturnType<typeof useFinance>['paymentRequest']>;
  cancel: () => void; confirm: (amount: number) => boolean;
}> = ({ request, cancel, confirm }) => {
  const [value, setValue] = useState(request.account.amount.toFixed(2).replace('.', ','));
  const [error, setError] = useState('');
  const card = request.account.type === 'credit_card';
  return <div className="finance-overlay" onKeyDown={event => { if (event.key === 'Escape') cancel(); }}>
    <form role="dialog" aria-modal="true" aria-labelledby="payment-title" className="finance-dialog" onSubmit={event => {
      event.preventDefault();
      const normalized = value.trim().replace(',', '.');
      if (!/^\d+(\.\d{1,2})?$/.test(normalized)) { setError('Informe um valor válido com até duas casas decimais.'); return; }
      confirm(card ? request.account.amount : Number(normalized));
    }}>
      <span className="history-eyebrow">CONFERIR PAGAMENTO</span>
      <h2 id="payment-title">{request.account.name}</h2>
      <p>{formatMonthYear(request.month)}</p>
      <label htmlFor="payment-value">Valor do pagamento (R$)</label>
      <input id="payment-value" autoFocus inputMode="decimal" value={card ? formatBRL(request.account.amount) : value} readOnly={card} onChange={event => { setValue(event.target.value); setError(''); }} />
      <p>{card ? 'Total calculado pelas compras da fatura. Para corrigir, cancele e edite os itens.' : 'A correção vale somente para esta conta neste mês.'}</p>
      {error && <p role="alert">{error}</p>}
      <div className="finance-actions"><button type="button" onClick={cancel}>Cancelar</button><button className="finance-primary" type="submit">Confirmar pagamento</button></div>
    </form>
  </div>;
}
