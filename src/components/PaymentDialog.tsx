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
  const [value, setValue] = useState(request.account.type === 'credit_card'
    ? (request.account.cardInfo?.paidAmount ? request.account.cardInfo.paidAmount.toFixed(2).replace('.', ',') : '')
    : request.account.amount.toFixed(2).replace('.', ','));
  const [error, setError] = useState('');
  const card = request.account.type === 'credit_card';
  return <div className="finance-overlay" onKeyDown={event => { if (event.key === 'Escape') cancel(); }}>
    <form role="dialog" aria-modal="true" aria-labelledby="payment-title" className="finance-dialog" onSubmit={event => {
      event.preventDefault();
      const normalized = value.trim().replace(',', '.');
      if (!/^\d+(\.\d{1,2})?$/.test(normalized)) { setError('Informe um valor válido com até duas casas decimais.'); return; }
      const amount = Number(normalized);
      if (card && (amount <= 0 || amount > request.account.amount)) { setError('Informe um valor maior que zero e até o total da fatura.'); return; }
      confirm(amount);
    }}>
      <span className="history-eyebrow">CONFERIR PAGAMENTO</span>
      <h2 id="payment-title">{request.account.name}</h2>
      <p>{formatMonthYear(request.month)}</p>
      <label htmlFor="payment-value">{card ? 'Total pago nesta fatura (R$)' : 'Valor do pagamento (R$)'}</label>
      <input id="payment-value" autoFocus inputMode="decimal" value={value} onChange={event => { setValue(event.target.value); setError(''); }} />
      <p>{card ? `Fatura: ${formatBRL(request.account.amount)}. Informe o total já pago neste mês, incluindo pagamentos anteriores. O restante segue para o próximo mês.` : 'A correção vale somente para esta conta neste mês.'}</p>
      {error && <p role="alert">{error}</p>}
      <div className="finance-actions"><button type="button" onClick={cancel}>Cancelar</button><button className="finance-primary" type="submit">Confirmar pagamento</button></div>
    </form>
  </div>;
}
