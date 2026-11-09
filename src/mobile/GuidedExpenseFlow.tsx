import { Fragment, type FormEvent } from 'react';
import { formatBRL } from '../utils/formatters';
import { ChatBubble } from './ChatBubble';
import { PAYMENT_METHODS, type GuidedExpense, type Preview } from './conversation';
import { parseMobileMoney } from './model';

export const guidedPrompts = {
  name: 'O que você comprou?',
  location: 'Onde comprou?',
  paid: 'Já foi pago?',
  method: 'Como pagou?',
  credit: 'Como foi a compra no crédito?',
  installments: 'Quantas parcelas?',
  amount: 'Qual o valor?',
  preview: 'Confira antes de adicionar',
  correction: 'O que você quer corrigir?',
};

type Step = keyof typeof guidedPrompts;
const corrections = [['name', 'Descrição'], ['location', 'Local'], ['paid', 'Pagamento'], ['amount', 'Valor']] as const;
const installments = Array.from({ length: 119 }, (_, index) => index + 2);

export interface GuidedDraft {
  id: string;
  command: string;
  step: Step;
  expense: GuidedExpense;
  turns: { step: Step; answer: string }[];
}

export function startsGuidedExpense(text: string) {
  return /^(?:compra|comprei|nova compra|fiz uma compra|(?:adicionar|registrar) (?:uma )?compra)[.!?…]*$/i.test(text.trim().replace(/\s+/g, ' '));
}

export function startGuidedExpense(command: string, month: string): GuidedDraft {
  return { id: crypto.randomUUID(), command, step: 'name', expense: { name: '', location: '', month, count: 1, amount: 0 }, turns: [] };
}

export function guidedTextValue({ step, expense }: GuidedDraft) {
  if (step === 'name' || step === 'location') return expense[step];
  if (step === 'amount') return expense.amount ? String(expense.amount).replace('.', ',') : '';
}

function advance(draft: GuidedDraft, step: Step, answer: string, changes?: Partial<GuidedExpense>): GuidedDraft {
  return { ...draft, step, expense: { ...draft.expense, ...changes }, turns: [...draft.turns, { step: draft.step, answer }] };
}

export function answerGuidedText(draft: GuidedDraft, answer: string) {
  const { step, expense } = draft;
  if (step === 'name' || step === 'location') {
    const next = step === 'name' ? 'location' : 'paid';
    return advance(draft, expense.amount ? 'preview' : next, answer, { [step]: answer });
  }
  if (step === 'amount') {
    const amount = parseMobileMoney(answer);
    if (amount !== null) return advance(draft, 'preview', formatBRL(amount), { amount });
  }
}

export function GuidedExpenseSummary({ expense }: { expense: Pick<Preview, 'name' | 'location' | 'amount' | 'count' | 'paymentMethod'> }) {
  return <>
    <h2>{expense.name}</h2>
    <p>{expense.location}</p>
    <p className="chat-confirmation-copy">{formatBRL(expense.amount)}</p>
    <p>{expense.paymentMethod ? 'Pago' : 'Pendente'}</p>
    {expense.paymentMethod && <p>{expense.paymentMethod}</p>}
    {expense.paymentMethod === 'Crédito' && <p>{expense.count === 1 ? 'À vista' : `Parcelado em ${expense.count}x`}</p>}
  </>;
}

export function GuidedExpenseFlow({ draft, author, onChange, onSave, busy, saving }: {
  draft: GuidedDraft; author: string; onChange: (draft: GuidedDraft) => void; onSave: () => void; busy: boolean; saving: boolean;
}) {
  const { step, expense } = draft;
  const afterPayment = expense.amount ? 'preview' : 'amount';
  const choose = (next: Step, answer: string, changes?: Partial<GuidedExpense>) => onChange(advance(draft, next, answer, changes));

  function chooseInstallments(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const count = Number(new FormData(event.currentTarget).get('count'));
    choose(afterPayment, `${count} parcelas`, { count });
  }

  return <>
    <ChatBubble role="user" name={author}><p>{draft.command}</p></ChatBubble>
    {draft.turns.map((turn, index) => <Fragment key={index}>
      <ChatBubble role="assistant" name="Contas Tatu"><p>{guidedPrompts[turn.step]}</p></ChatBubble>
      <ChatBubble role="user" name={author}><p>{turn.answer}</p></ChatBubble>
    </Fragment>)}
    <ChatBubble role="assistant" name="Contas Tatu">
      <p>{guidedPrompts[step]}</p>
      {step === 'paid' && <div className="chat-actions chat-guided-actions">
        <button type="button" onClick={() => choose('method', 'Sim')}>Sim</button>
        <button type="button" onClick={() => choose(afterPayment, 'Não', { paymentMethod: undefined, count: 1 })}>Não</button>
      </div>}
      {step === 'method' && <div className="chat-actions chat-guided-actions">
        {PAYMENT_METHODS.map(method => <button type="button" key={method} onClick={() => choose(method === 'Crédito' ? 'credit' : afterPayment, method, { paymentMethod: method, count: method === 'Crédito' ? expense.count : 1 })}>{method}</button>)}
      </div>}
      {step === 'credit' && <div className="chat-actions chat-guided-actions">
        <button type="button" onClick={() => choose(afterPayment, 'À vista', { count: 1 })}>À vista</button>
        <button type="button" onClick={() => choose('installments', 'Parcelado')}>Parcelado</button>
      </div>}
      {step === 'installments' && <form className="chat-actions chat-guided-actions" onSubmit={chooseInstallments}>
        <select name="count" aria-label="Quantidade de parcelas" defaultValue={Math.max(2, expense.count)}>
          {installments.map(count => <option key={count} value={count}>{count}x</option>)}
        </select>
        <button type="submit">Continuar</button>
      </form>}
      {step === 'preview' && <div className="chat-preview">
        <GuidedExpenseSummary expense={expense} />
        <div className="chat-actions chat-guided-actions">
          <button type="button" className="mobile-primary" disabled={busy} onClick={onSave}>{saving ? 'Salvando…' : 'Adicionar'}</button>
          <button type="button" disabled={busy} onClick={() => choose('correction', 'Corrigir')}>Corrigir</button>
        </div>
      </div>}
      {step === 'correction' && <div className="chat-actions chat-guided-actions">
        {corrections.map(([field, label]) => <button type="button" key={field} onClick={() => choose(field, label)}>{label}</button>)}
      </div>}
    </ChatBubble>
  </>;
}
