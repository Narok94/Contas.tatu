import React, { useEffect, useRef, useState } from 'react';
import { Menu, Send, Check, ChevronDown } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { addMonths, formatBRL, formatMonthYear } from '../utils/formatters';
import MobileManual from './MobileManual';
import { MobileSheet } from './MobileSheet';
import { MobileEntryForm, type EntryKind } from './MobileEntryForm';
import { type ChatMessage } from './conversation';
import { useHouseholdChat } from './useHouseholdChat';
import { ACCESS_MESSAGE } from './model';
import { useAuth } from '../auth/AuthContext';
import { ChatParticipant, participantTone } from './ChatParticipant';
import './mobile.css';
import './conversation.css';

export default function MobileApp() {
  const f = useFinance();
  const { user, logout } = useAuth();
  const [screen, setScreen] = useState<'conversation' | 'choose' | 'list'>('conversation');
  const [sheet, setSheet] = useState<'menu' | 'months'>();
  const [anchor, setAnchor] = useState(f.currentMonth);
  const [text, setText] = useState('');
  const [searchText,setSearchText]=useState(''), [search,setSearch]=useState(''), [author,setAuthor]=useState('');
  const chat=useHouseholdChat(search,author);
  const {messages}=chat;
  const [correction, setCorrection] = useState<ChatMessage>();
  const [error, setError] = useState('');
  const [pending, setPending] = useState('');
  const lock = useRef(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const stream = end.current?.parentElement;
    if(stream && stream.scrollHeight-stream.scrollTop-stream.clientHeight<250) stream.scrollTo({ top: stream.scrollHeight, behavior: 'smooth' });
  }, [messages, screen]);
  useEffect(() => {
    if (screen !== 'conversation') return;
    const root = document.documentElement, body = document.body;
    const properties = ['overflow', 'overscroll-behavior', 'position', 'width', 'height'] as const;
    const previous = [root, body].map(element => properties.map(property => ({
      property, value: element.style.getPropertyValue(property), priority: element.style.getPropertyPriority(property),
    })));
    const scrollY = window.scrollY;
    root.style.overflow = 'hidden'; root.style.overscrollBehavior = 'none'; root.style.height = '100%';
    body.style.overflow = 'hidden'; body.style.overscrollBehavior = 'none';
    body.style.position = 'fixed'; body.style.width = '100%'; body.style.height = '100%';
    const stream = end.current?.parentElement;
    if (stream) stream.style.overscrollBehavior = 'none';
    // Also contain edge drags on iOS versions that do not support overscroll-behavior.
    let touchY = 0;
    const start = (event: TouchEvent) => { touchY = event.touches[0]?.clientY ?? 0; };
    const move = (event: TouchEvent) => {
      if (event.touches.length !== 1 || !(event.target instanceof Element)) return;
      if (event.target.closest('.mobile-sheet')) return;
      const area = event.target.closest<HTMLElement>('.chat-stream');
      const currentY = event.touches[0].clientY, delta = currentY - touchY;
      touchY = currentY;
      if (!area || area.scrollHeight <= area.clientHeight ||
        (delta > 0 && area.scrollTop <= 0) ||
        (delta < 0 && area.scrollTop + area.clientHeight >= area.scrollHeight - 1)) {
        if (event.cancelable) event.preventDefault();
      }
    };
    document.addEventListener('touchstart', start, { passive: true });
    document.addEventListener('touchmove', move, { passive: false });
    return () => {
      document.removeEventListener('touchstart', start); document.removeEventListener('touchmove', move);
      [root, body].forEach((element, index) => previous[index].forEach(({ property, value, priority }) => {
        if (value) element.style.setProperty(property, value, priority); else element.style.removeProperty(property);
      }));
      window.scrollTo(0, scrollY);
    };
  }, [screen]);
  useEffect(() => {
    const v = window.visualViewport;
    const update = () => { document.documentElement.style.setProperty('--chat-height', `${v?.height ?? window.innerHeight}px`); document.documentElement.style.setProperty('--chat-top', `${v?.offsetTop ?? 0}px`); };
    update(); v?.addEventListener('resize', update); v?.addEventListener('scroll', update);
    return () => { v?.removeEventListener('resize', update); v?.removeEventListener('scroll', update); };
  }, []);
  async function send(e: React.FormEvent) {
    e.preventDefault(); if (!text.trim() || chat.busy) return;
    if(await chat.send(text.trim(),f.currentMonth)){setText('');setError('');}
  }
  async function confirm(m: ChatMessage) {
    if (!m.preview || lock.current || m.saved || f.busy || chat.busy) return;
    if (!f.ready || !f.submitFinancialCommand) { setError(f.apiErrorStatus === 403 ? ACCESS_MESSAGE : 'Não foi possível conectar. Atualize os dados e tente novamente.'); return; }
    lock.current = true; setPending(m.id); setError('');
    try { if(await chat.confirm(m))f.refresh(); }
    finally { lock.current = false; setPending(''); }
  }
  if (screen !== 'conversation') return <MobileManual initialScreen={screen} onBack={() => setScreen('conversation')} />;
  const p = correction?.preview;
  const kind: EntryKind = p?.count && p.count > 1 ? 'installment' : p?.cardId ? 'card' : 'account';
  return <div className="mobile-app chat-app" data-testid="mobile-app">
    <header className="chat-header"><img src="/icons/tatu-mobile.webp" alt="" width="46" height="46" /><div><h1>Contas Tatu<span>.</span></h1><p>Grupo da casa</p></div><button aria-label="Menu" className="mobile-icon-button" onClick={() => setSheet('menu')}><Menu size={21} /></button></header>
    <div className="chat-members"><ChatParticipant name="Henrique" avatarOnly /><ChatParticipant name="Jéssica" avatarOnly /><span>Henrique e Jéssica</span><button onClick={() => { setAnchor(f.currentMonth); setSheet('months'); }}>{formatMonthYear(f.currentMonth)} <ChevronDown size={14} /></button></div>
    <form className="chat-history-search" onSubmit={e=>{e.preventDefault();setSearch(searchText.trim());}}>
      <input aria-label="Buscar no histórico" placeholder="Buscar conta, compra ou mensagem" maxLength={160} value={searchText} onChange={e=>setSearchText(e.target.value)} />
      <select aria-label="Filtrar por autor" value={author} onChange={e=>setAuthor(e.target.value)}><option value="">Todos</option>{chat.participants.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><button type="submit">Buscar</button>
    </form>
    <main className="chat-stream" role="log" aria-label="Conversa da casa" aria-live="polite"><p className="chat-note">CONTAS EM DIA, CASA MAIS LEVE</p>{!chat.ready && <p role="status">Carregando conversa…</p>}{chat.nextBefore && <button className="mobile-secondary" onClick={()=>void chat.refresh(chat.nextBefore!)}>Mensagens anteriores</button>}{chat.ready && !messages.length && <p>Oi, casal! Me conte uma conta ou compra. Eu organizo, vocês conferem antes de adicionar.</p>}{messages.map(m => <article key={m.id} className={`chat-message ${m.role} ${m.role === 'user' && participantTone(m.authorName) === 'jessica' ? 'local-jessica' : ''}`}>
      {m.role === 'assistant' ? <img className="chat-tatu" src="/icons/tatu-mobile.webp" alt="" /> : <ChatParticipant name={m.authorName} avatarOnly />}
      <div className="chat-bubble"><div className="chat-byline"><b>{m.authorName}</b><time dateTime={m.createdAt}>{new Date(m.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</time></div><p>{m.text}</p>
        {m.interactionAuthor && <div className="chat-interaction-author"><ChatParticipant name={m.interactionAuthor.name} /></div>}
        {m.preview && <div className="chat-preview"><h2>{m.preview.name}</h2><strong>{formatBRL(m.preview.amount)}</strong><p>{formatMonthYear(m.preview.month)}{m.preview.paid ? ' · Paga' : ''}</p>{m.preview.count > 1 && <p>{m.preview.count} parcelas de {formatBRL(m.preview.amount / m.preview.count)}</p>}{m.preview.cardName && <p>{m.preview.cardName}</p>}<span className="chat-category" style={{ color: f.categories.find(c => c.id === m.preview?.categoryId)?.color }}>{f.categories.find(c => c.id === m.preview?.categoryId)?.name ?? 'Sem categoria'} · sugerida</span>
          {m.saved ? <p className="chat-saved"><Check size={16} /> Adicionada</p> : <div className="chat-actions"><button className="mobile-primary" disabled={!!pending || f.busy || chat.busy || !chat.ready} onClick={() => void confirm(m)}>{pending === m.id ? 'Salvando…' : 'Adicionar'}</button><button disabled={!!pending || f.busy || chat.busy || !chat.ready} onClick={() => setCorrection(m)}>Corrigir</button></div>}</div>}
        {!m.preview && m.text.startsWith('Não consegui') && <button className="mobile-secondary" onClick={() => setScreen('choose')}>Ir para Geral</button>}
      </div></article>)}<div ref={end} /></main>
    <footer className="chat-footer">{(chat.error || error || f.operationError) && <div className="chat-error" role="alert">{chat.error || error || (f.apiErrorStatus === 403 ? ACCESS_MESSAGE : f.operationError)}<button onClick={()=>{f.refresh();void chat.refresh();}}>Atualizar dados</button></div>}<nav className="chat-shortcuts" aria-label="Atalhos da conversa"><button onClick={() => setScreen('choose')}>Geral</button><button onClick={() => setScreen('list')}>Contas do mês</button><button onClick={() => { setAnchor(f.currentMonth); setSheet('months'); }}>Selecionar mês</button></nav><form className="chat-composer" onSubmit={send}><input aria-label="Digite sua conta" placeholder="Digite sua conta..." maxLength={300} value={text} onChange={e => setText(e.target.value)} enterKeyHint="send" /><button type="submit" aria-label="Enviar" disabled={!text.trim() || chat.busy || !chat.ready}><Send size={21} /></button></form></footer>
    {sheet && <MobileSheet title={sheet === 'menu' ? 'Seu Contas Tatu' : 'Selecionar mês'} onClose={() => setSheet(undefined)}>{sheet === 'menu' ? <><div className="chat-tools"><span className="chat-current-participant"><ChatParticipant name={user.name} /><span>·</span><button onClick={() => void logout()}>Sair</button></span></div><div className="mobile-sheet-actions">{(['Conversa', 'Geral', 'Contas deste mês', 'Selecionar mês'] as const).map((label, i) => <button key={label} onClick={() => { if (i === 3) { setAnchor(f.currentMonth); setSheet('months'); } else { setScreen(i === 1 ? 'choose' : i === 2 ? 'list' : 'conversation'); setSheet(undefined); } }}>{label}</button>)}</div></> : <div className="mobile-month-list">{Array.from({ length: 12 }, (_, i) => addMonths(anchor, -i)).map(month => <button key={month} onClick={() => { f.setCurrentMonth(month); setSheet(undefined); }}>{formatMonthYear(month)}{month === f.currentMonth && <Check size={18} />}</button>)}<button onClick={() => setAnchor(addMonths(anchor, -12))}>Meses anteriores</button></div>}</MobileSheet>}
    {correction && p && <MobileSheet title="Corrigir lançamento" onClose={() => { if (!f.busy) setCorrection(undefined); }}><div className="chat-interaction-author"><ChatParticipant name={correction.interactionAuthor?.name ?? user.name} /></div><MobileEntryForm kind={kind} initial={p} onConfirm={async preview=>{const ok=await chat.confirm(correction,preview);if(ok)f.refresh();return ok;}} onSuccess={() => setCorrection(undefined)} /></MobileSheet>}
  </div>;
}
