import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { AccountsPage } from '../pages/AccountsPage';
import { CardDetailsPage } from '../pages/CardDetailsPage';
import { AccountModal } from '../components/AccountModal';
import { PaymentDialog } from '../components/PaymentDialog';
import { addMonths } from '../utils/formatters';
import '../history.css';
import './mobileAccounts.css';

export default function MobileAccounts() {
  const f = useFinance();
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const accountsScroll = useRef(0);
  const hasView = f.mode !== 'neon' || f.hasCurrentView;

  function changeMonth(month: string) {
    if (f.busy || !/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(month)) return;
    setSelectedCardId(null);
    f.clearOperationError();
    f.setCurrentMonth(month);
  }

  function backToAccounts() {
    const cardId = selectedCardId;
    setSelectedCardId(null);
    requestAnimationFrame(() => {
      window.scrollTo(0, accountsScroll.current);
      document.getElementById(`btn-expand-card-${cardId}`)?.focus({ preventScroll: true });
    });
  }

  return <section className="mobile-accounts" aria-label="Conferência de contas">
    <div className="mobile-accounts-month">
      <button type="button" className="mobile-icon-button" aria-label="Mês anterior" disabled={f.busy} onClick={() => changeMonth(addMonths(f.currentMonth, -1))}><ChevronLeft size={20} /></button>
      <label className="mobile-field">Mês das contas<input type="month" value={f.currentMonth} disabled={f.busy} onChange={event => changeMonth(event.target.value)} /></label>
      <button type="button" className="mobile-icon-button" aria-label="Próximo mês" disabled={f.busy} onClick={() => changeMonth(addMonths(f.currentMonth, 1))}><ChevronRight size={20} /></button>
    </div>
    {(f.loading || f.busy) && <p role="status" className="mobile-accounts-status">{f.busy ? 'Salvando alterações.' : 'Carregando contas.'}</p>}
    {f.operationError && <div className="mobile-error mobile-accounts-error" role="alert"><p>{f.operationError}</p><button type="button" disabled={f.busy || f.loading} onClick={f.refresh}>Tentar novamente</button><button type="button" onClick={f.clearOperationError}>Fechar aviso</button></div>}
    {!hasView ? !f.loading && <div className="mobile-empty"><p>Não foi possível carregar as contas deste mês.</p><button type="button" className="mobile-secondary" onClick={f.refresh}>Tentar novamente</button></div> : <>
      {f.store.closedMonths?.[f.currentMonth] && <p className="mobile-notice">Mês fechado. Os registros estão disponíveis para conferência.</p>}
      <AccountsPage hidden={Boolean(selectedCardId)} onViewCard={cardId => { accountsScroll.current = window.scrollY; setSelectedCardId(cardId); }} />
      {selectedCardId && <CardDetailsPage cardId={selectedCardId} onBack={backToAccounts} />}
      {!selectedCardId && <button type="button" className="mobile-primary" disabled={!f.ready || f.busy || f.loading || Boolean(f.store.closedMonths?.[f.currentMonth])} onClick={f.openCreateAccountModal}><Plus size={20} />Adicionar conta</button>}
    </>}
    <AccountModal isOpen={f.isAccountModalOpen} editingAccount={f.editingAccount} onClose={f.closeAccountModal} />
    <PaymentDialog />
  </section>;
}
