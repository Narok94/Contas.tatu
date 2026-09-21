import React from 'react';
import { MoreHorizontal } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { UnifiedMonthlyAccount } from '../types/finance';

export const PaymentOptions: React.FC<{ account: UnifiedMonthlyAccount }> = ({ account }) => {
  const { editValueAndPay } = useFinance();
  if (account.status === 'pago') return null;
  return <details className="payment-options" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.removeAttribute('open');
  }} onKeyDown={event => {
    if (event.key === 'Escape') {
      event.currentTarget.removeAttribute('open');
      event.currentTarget.querySelector('summary')?.focus();
    }
  }}>
    <summary aria-label={`Opções de pagamento de ${account.name}`} title="Opções de pagamento"><MoreHorizontal size={16} /></summary>
    <button type="button" onClick={event => {
      event.currentTarget.closest('details')?.removeAttribute('open');
      editValueAndPay(account);
    }}>{account.type === 'credit_card' ? 'Registrar pagamento parcial' : 'Alterar valor ao pagar'}</button>
  </details>;
};
