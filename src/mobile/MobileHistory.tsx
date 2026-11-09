import { useState } from 'react';
import { useFinance } from '../context/FinanceContext';
import { openAmount } from '../domain/paymentBalances';
import { formatBRL, formatMonthYear } from '../utils/formatters';
import { ChatBubble } from './ChatBubble';
import type { ChatMessage } from './conversation';
import { useHouseholdChat } from './useHouseholdChat';

export function MobileHistory() {
  const f = useFinance();
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const chat = useHouseholdChat(search, '');
  const [accounts, setAccounts] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const records = [...new Map<string, ChatMessage>(chat.messages.filter(message => message.saved && message.preview)
    .map(message => [message.linkedFinancialOperationId ?? message.id, message])).values()];
  const categories = new Map(f.categories.map(category => [category.id, category.name]));
  const names = new Map<string, string>(chat.participants.map(participant => [participant.id, participant.name]));
  const needle = search.toLocaleLowerCase('pt-BR');
  const payments = (f.store.mobilePayments ?? []).filter(payment => !needle ||
    [payment.name, payment.categoryName, payment.location].some(value => value?.toLocaleLowerCase('pt-BR').includes(needle)));
  const date = (value: string) => new Date(value).toLocaleDateString('pt-BR');

  const timeline = [
    ...records.map(message => ({ id: message.id, createdAt: message.createdAt, render: () => {
      const preview = message.preview!;
      return <ChatBubble role="assistant" name={message.interactionAuthor?.name ?? 'Contas Tatu'} createdAt={message.createdAt}>
        <p>{date(message.createdAt)} · {formatMonthYear(preview.month)}</p>
        <div className="chat-preview">
          <h3>{preview.name}</h3>
          <p>{preview.categoryName ?? categories.get(preview.categoryId ?? '') ?? (preview.cardId ? 'Cartão' : 'Geral')}</p>
          {preview.location && <p>{preview.location}</p>}
          <p><strong>{formatBRL(preview.amount)}</strong> · {preview.paid ? 'Pago' : 'Pendente'}</p>
          {preview.count > 1 && <p>{preview.count} parcelas</p>}
        </div>
      </ChatBubble>;
    } })),
    ...payments.map(payment => ({ id: payment.id, createdAt: payment.createdAt, render: () =>
      <ChatBubble role="assistant" name={names.get(payment.actorId) ?? 'Contas Tatu'} createdAt={payment.createdAt}>
        <p>{date(payment.createdAt)} · {formatMonthYear(payment.month)}</p>
        <div className="chat-preview">
          <h3>{payment.name}</h3>
          <p>{payment.categoryName ?? (payment.accountType === 'credit_card' ? 'Cartão' : 'Geral')}</p>
          {payment.location && <p>{payment.location}</p>}
          <p><strong>{formatBRL(payment.paidAmount)}</strong> · {payment.remainingAmount > 0 ? 'Pagamento parcial' : 'Pagamento total'}</p>
          {payment.remainingAmount > 0 && <p>{formatBRL(payment.remainingAmount)} {payment.targetMonth ?
            `transferidos para ${formatMonthYear(payment.targetMonth)}` : 'pendentes neste mês'}</p>}
        </div>
      </ChatBubble>,
    })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return <div className="mobile-flow-form">
    <div className="mobile-flow-tabs" role="group" aria-label="Exibir no histórico">
      <button type="button" aria-pressed={!accounts} onClick={() => setAccounts(false)}>Registros</button>
      <button type="button" aria-pressed={accounts} onClick={() => setAccounts(true)}>Contas do mês</button>
    </div>
    {accounts ? <>
      <label className="mobile-field">Mês das contas<input type="month" value={f.currentMonth} onChange={e => {
        if (/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value)) f.setCurrentMonth(e.target.value);
      }} /></label>
      {f.loading && <p role="status">Buscando contas…</p>}
      {f.hasCurrentView && f.monthlyAccounts.map(account => {
        const createdAt = f.store.simpleAccounts.find(row => row.id === account.id)?.createdAt ??
          f.store.installmentPurchases.find(row => row.id === account.id)?.createdAt ??
          f.store.recurringDefinitions.find(row => row.id === account.id)?.createdAt ??
          f.store.cardMonthlyInvoices.find(row => row.cardId === account.id && row.month === f.currentMonth)?.paidAt;
        const location = account.notes?.match(/^Local: (.+)$/m)?.[1];
        const paid = account.paymentInfo?.paidAmount ?? account.cardInfo?.paidAmount;
        return <div key={`${account.type}:${account.id}`}><ChatBubble role="assistant" name="Contas Tatu" createdAt={createdAt}>
          <p>{createdAt ? `${date(createdAt)} · ` : ''}{formatMonthYear(f.currentMonth)}</p>
          <div className="chat-preview">
            <h3>{account.name}</h3>
            <p>{account.category?.name ?? (account.cardInfo ? 'Cartão' : 'Geral')}</p>
            {location && <p>{location}</p>}
            <p><strong>{formatBRL(account.amount)}</strong> · {account.status === 'pago' ? 'Pago' : account.status === 'parcial' ? 'Parcial' : 'Pendente'}</p>
            {account.status === 'parcial' && paid !== undefined && <p>{formatBRL(paid)} pagos · {formatBRL(openAmount(account))} em aberto</p>}
          </div>
        </ChatBubble></div>;
      })}
      {f.ready && !f.monthlyAccounts.length && <p className="mobile-empty">Nenhuma conta neste mês.</p>}
    </> : <>
      <form className="mobile-history-search" onSubmit={event => { event.preventDefault(); setSearch(query.trim()); }}>
        <label className="mobile-field">Buscar no histórico<input type="search" value={query} maxLength={160} onChange={event => setQuery(event.target.value)} /></label>
        <button type="submit" className="mobile-secondary">Buscar</button>
      </form>
      {(chat.error || f.operationError) && <p className="mobile-error" role="alert">{chat.error || f.operationError}</p>}
      {!chat.ready && !chat.error && <p role="status">Carregando histórico…</p>}
      {timeline.map(record => <div key={record.id}>{record.render()}</div>)}
      {chat.ready && !timeline.length && <p className="mobile-empty">Nenhum registro encontrado.</p>}
      {chat.nextBefore && <button type="button" className="mobile-secondary" disabled={loadingMore} onClick={async () => {
        setLoadingMore(true);
        try { await chat.refresh(chat.nextBefore!); } finally { setLoadingMore(false); }
      }}>{loadingMore ? 'Carregando…' : 'Registros anteriores'}</button>}
    </>}
  </div>;
}
