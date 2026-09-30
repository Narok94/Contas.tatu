import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronDown, ChevronRight, CreditCard, Layers, Plus, ReceiptText } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { addMonths, formatBRL, formatMonthYear } from '../utils/formatters';
import { MobileEntryForm, type EntryKind, type EntrySuccess } from './MobileEntryForm';
import { MobileSheet } from './MobileSheet';
import { ACCESS_MESSAGE, ADMIN_MESSAGE, canQuickEdit, monthlyEntries, recentEntries, type MobileEntry } from './model';
import './mobile.css';

type Screen = 'home' | 'choose' | 'list' | 'form' | 'success';
export default function MobileManual({ initialScreen, onBack }: { initialScreen: 'choose' | 'list'; onBack: () => void }) {
  const f = useFinance();
  const [screen, setScreen] = useState<Screen>(initialScreen);
  const [kind, setKind] = useState<EntryKind>('account');
  const [editing, setEditing] = useState<MobileEntry>();
  const [selected, setSelected] = useState<MobileEntry>();
  const [monthSheet, setMonthSheet] = useState(false);
  const [monthAnchor, setMonthAnchor] = useState(f.currentMonth);
  const [confirm, setConfirm] = useState<'remove' | 'pay'>();
  const [notice, setNotice] = useState('');
  const [success, setSuccess] = useState<EntrySuccess>();
  const root = useRef<HTMLDivElement>(null);
  const actionLock = useRef(false);
  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => {
      document.documentElement.style.setProperty('--mobile-visual-height', `${viewport?.height ?? window.innerHeight}px`);
      document.documentElement.style.setProperty('--mobile-keyboard-inset', `${Math.max(0, window.innerHeight - (viewport?.height ?? window.innerHeight) - (viewport?.offsetTop ?? 0))}px`);
      const field = document.activeElement;
      if (field instanceof HTMLElement && field.matches('input, select')) field.scrollIntoView({ block: 'nearest' });
    };
    update(); viewport?.addEventListener('resize', update); viewport?.addEventListener('scroll', update);
    return () => { viewport?.removeEventListener('resize', update); viewport?.removeEventListener('scroll', update); };
  }, []);
  useEffect(() => { window.scrollTo(0, 0); root.current?.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true }); }, [screen]);
  const go = (next: Screen) => { if (next === 'home') { onBack(); return; } setNotice(''); f.clearOperationError(); setScreen(next); };
  const choose = (value: EntryKind) => { setKind(value); setEditing(undefined); go('form'); };
  const open = (entry: MobileEntry) => { setSelected(entry); setConfirm(undefined); setNotice(''); f.clearOperationError(); };
  const close = () => { if (!f.busy) { setSelected(undefined); setMonthSheet(false); setNotice(''); } };
  const blocked = f.apiErrorStatus === 403;
  const records = screen === 'list' ? (f.hasCurrentView ? monthlyEntries(f.monthlyAccounts, f.currentMonth) : []) : recentEntries(f.store).slice(0, 5);
  const title = screen === 'choose' ? 'O que você quer adicionar?' : screen === 'list' ? 'Contas deste mês' : screen === 'form' ? editing ? 'Edição rápida' : kind === 'account' ? 'Nova conta' : kind === 'card' ? 'Compra no cartão' : 'Novo parcelamento' : 'Tudo certo!';
  const startEdit = () => {
    if (!selected) return;
    if (!canQuickEdit(selected, f.store)) { setNotice(ADMIN_MESSAGE); return; }
    setEditing(selected); setKind(selected.kind === 'expense' ? 'card' : 'account'); setSelected(undefined); go('form');
  };
  async function action() {
    if (!selected || actionLock.current || f.busy || !f.submitFinancialCommand) return;
    if (!f.ready) { setNotice(blocked ? ACCESS_MESSAGE : 'Atualize seus dados antes de continuar.'); return; }
    const month = selected.kind === 'installment' && confirm === 'remove' ? f.currentMonth : selected.month;
    if (f.store.closedMonths?.[month] || selected.kind === 'credit_card' && confirm === 'remove' || selected.kind === 'recurring' && confirm === 'remove') { setNotice(ADMIN_MESSAGE); return; }
    actionLock.current = true;
    try {
      const data = confirm === 'pay' ? { id: selected.id, type: selected.kind, status: 'pago' } :
        selected.kind === 'installment' ? { id: selected.id, reason: 'Cancelamento pelo aplicativo a partir do mês selecionado' } : { id: selected.id };
      const command = confirm === 'pay' ? 'payment' : selected.kind === 'installment' ? 'installment.cancel' : `${selected.kind}.archive`;
      if (await f.submitFinancialCommand(command, data, month)) { setSelected(undefined); }
      else setNotice(f.store.closedMonths?.[month] ? ADMIN_MESSAGE : 'Não foi possível concluir. Confira o aviso e os dados atualizados antes de tentar novamente.');
    } finally { actionLock.current = false; }
  }
  const row = (entry: MobileEntry) => {
    const category = f.categories.find(c => c.id === entry.categoryId);
    return <li key={entry.key}><button className="mobile-entry" onClick={() => open(entry)}>
      <span className="mobile-entry-icon" style={{ color: category?.color ?? '#116b70' }}>{entry.kind === 'expense' || entry.kind === 'credit_card' ? <CreditCard size={20} /> : entry.kind === 'installment' ? <Layers size={20} /> : <ReceiptText size={20} />}</span>
      <span className="mobile-entry-copy"><b>{entry.name}</b><small>{entry.reference}{category ? ` · ${category.name}` : ''}</small>{entry.badge && <span className={`mobile-badge ${entry.paid ? 'paid' : ''}`}>{entry.badge}</span>}</span>
      <span className="mobile-entry-value">{formatBRL(entry.amount)}<ChevronRight size={15} aria-hidden="true" /></span>
    </button></li>;
  };
  return <div ref={root} className="mobile-app" data-testid="mobile-app">
    {screen === 'home' ? <header className="mobile-brand"><img src="/icons/tatu-mobile.webp" alt="" width="56" height="56" /><div><strong>Contas Tatu<span>.</span></strong><p>{new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</p></div></header> :
      <header className="mobile-topbar"><button className="mobile-icon-button" aria-label="Voltar" onClick={() => go(screen === 'form' && !editing ? 'choose' : 'home')}><ArrowLeft size={22} /></button><span>Contas Tatu</span><span className="mobile-top-dot" aria-hidden="true" /></header>}
    <main>
      {screen === 'home' && <>
        <section className="mobile-welcome"><span className="mobile-eyebrow">SEU DIA, MAIS LEVE</span><h1 tabIndex={-1}>Registre.<br />E siga o dia.</h1><p>Uma conta a menos na cabeça.</p><button className="mobile-primary mobile-add" onClick={() => go('choose')}><Plus size={23} /> Adicionar conta <ArrowRight size={20} /></button></section>
        <div className="mobile-section-heading"><h2>ADICIONADOS RECENTEMENTE</h2><button onClick={() => go('list')}>Ver todos <ChevronRight size={16} /></button></div>
      </>}
      {screen !== 'home' && <h1 tabIndex={-1} className="mobile-page-title">{title}</h1>}
      {screen === 'choose' && <div className="mobile-choices"><p>Do dia a dia ao parcelado.<br />Escolha por onde começar.</p>{([
        ['account', 'Conta', 'Uma despesa comum do dia a dia.', ReceiptText],
        ['card', 'Compra no cartão', 'À vista ou parcelada no seu cartão.', CreditCard],
        ['installment', 'Parcelamento', 'Com ou sem cartão, no seu ritmo.', Layers],
      ] as const).map(([value, name, text, Icon]) => <button key={value} onClick={() => choose(value)}><span className={`mobile-choice-icon ${value}`}><Icon size={25} /></span><span><b>{name}</b><small>{text}</small></span><ChevronRight size={20} /></button>)}</div>}
      {screen === 'list' && <button className="mobile-month-button" onClick={() => { setMonthAnchor(f.currentMonth); setMonthSheet(true); }}>{formatMonthYear(f.currentMonth)}<ChevronDown size={18} /></button>}
      {(screen === 'home' || screen === 'list') && <>
        {f.loading ? <div className="mobile-empty" role="status">Buscando seus lançamentos…</div> : records.length ? <ul className="mobile-entries">{records.map(row)}</ul> : <div className="mobile-empty"><ReceiptText size={28} /><h3>{blocked || !f.ready ? 'Seu espaço está aqui' : 'Tudo leve por aqui'}</h3><p>{blocked || !f.ready ? 'Quando o acesso estiver disponível, seus lançamentos aparecerão aqui.' : screen === 'home' ? 'Adicione sua primeira conta. A gente organiza o resto.' : 'Nenhuma conta neste mês.'}</p></div>}
        {(blocked || f.operationError) && <div className="mobile-notice" role="alert"><p>{blocked ? ACCESS_MESSAGE : f.operationError}</p>{!blocked && <button onClick={f.refresh}>Tentar novamente</button>}</div>}
        {screen === 'list' && <button className="mobile-primary" onClick={() => go('choose')}><Plus size={21} />Adicionar conta</button>}
      </>}
      {screen === 'form' && <MobileEntryForm key={`${kind}:${editing?.key ?? 'new'}`} kind={kind} editing={editing} onSuccess={result => { setSuccess(result); go('success'); }} />}
      {screen === 'success' && success && <section className="mobile-success"><span className="mobile-success-check"><Check size={40} strokeWidth={2.5} /></span><h2>{success.title}</h2><p>{success.name}</p><strong>{formatBRL(success.amount)}</strong><button className="mobile-primary" onClick={() => go('choose')}><Plus size={21} />Adicionar outra conta</button><button className="mobile-secondary" onClick={() => go('home')}>Voltar para o início</button></section>}
    </main>
    {selected && <MobileSheet title={selected.name} onClose={close}>
      <p className="mobile-sheet-amount">{formatBRL(selected.amount)}</p><p className="mobile-hint">{selected.reference}</p>
      {!confirm ? <div className="mobile-sheet-actions"><button onClick={startEdit}>Editar<ChevronRight size={18} /></button>
        {!selected.paid && selected.kind !== 'expense' && (selected.kind !== 'installment' || selected.account) && <button onClick={() => setConfirm('pay')}>{selected.kind === 'credit_card' ? 'Pagar fatura inteira' : selected.kind === 'installment' ? 'Marcar parcela como paga' : 'Marcar como paga'}<Check size={18} /></button>}
        <button className="mobile-danger" onClick={() => setConfirm('remove')}>{selected.kind === 'installment' ? 'Cancelar parcelas futuras' : 'Excluir'}<ChevronRight size={18} /></button></div> : <div className="mobile-confirm"><p>{confirm === 'pay' ? `Confirmar o pagamento de ${formatBRL(selected.amount)}?` : selected.kind === 'installment' ? `Cancelar a partir de ${formatMonthYear(f.currentMonth)}, preservando os meses anteriores?` : 'Remover este lançamento da lista? O registro será arquivado.'}</p><button className="mobile-primary" disabled={f.busy} onClick={action}>{f.busy ? 'Salvando…' : 'Confirmar'}</button><button className="mobile-secondary" onClick={() => setConfirm(undefined)}>Voltar</button></div>}
      {(notice || f.operationError) && <p className="mobile-error" role="alert">{notice || f.operationError}</p>}
      <button className="mobile-secondary" disabled={f.busy} onClick={close}>Cancelar</button>
    </MobileSheet>}
    {monthSheet && <MobileSheet title="Selecionar mês" onClose={close}><div className="mobile-month-list">{Array.from({ length: 12 }, (_, i) => addMonths(monthAnchor, 1 - i)).map(month => <button key={month} aria-pressed={month === f.currentMonth} onClick={() => { f.setCurrentMonth(month); setMonthSheet(false); }}>{formatMonthYear(month)}{month === f.currentMonth && <Check size={20} />}</button>)}</div><div className="mobile-month-more"><button onClick={() => setMonthAnchor(addMonths(monthAnchor, -12))}>Meses anteriores</button><button onClick={() => setMonthAnchor(addMonths(monthAnchor, 12))}>Próximos meses</button></div><button className="mobile-secondary" onClick={close}>Cancelar</button></MobileSheet>}
  </div>;
}
