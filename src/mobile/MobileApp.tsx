import React, { useEffect, useRef, useState } from 'react';
import { Menu, Send, Check, ChevronDown } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { addMonths, formatBRL, formatMonthYear } from '../utils/formatters';
import MobileManual from './MobileManual';
import { MobileSheet } from './MobileSheet';
import { MobileEntryForm, type EntryKind } from './MobileEntryForm';
import { interpret, previewCommand, type ChatMessage, type Preview } from './conversation';
import { ACCESS_MESSAGE } from './model';
import { useAuth } from '../auth/AuthContext';
import { ChatParticipant, participantTone } from './ChatParticipant';
import './mobile.css';
import './conversation.css';

const message = (text: string, authorName = 'Contas Tatu', preview?: Preview): ChatMessage => ({ id: crypto.randomUUID(), authorId: authorName === 'Contas Tatu' ? 'assistant' : `local-${authorName.toLowerCase()}`, authorName, role: authorName === 'Contas Tatu' ? 'assistant' : 'user', text, createdAt: new Date().toISOString(), preview });
export default function MobileApp() {
  const f = useFinance();
  const { user, logout } = useAuth();
  const [screen, setScreen] = useState<'conversation' | 'choose' | 'list'>('conversation');
  const [sheet, setSheet] = useState<'menu' | 'months'>();
  const [anchor, setAnchor] = useState(f.currentMonth);
  const [text, setText] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>(() => [message('Oi, casa! Me conte uma conta ou compra. Eu organizo, vocês conferem antes de adicionar.')]);
  const [correction, setCorrection] = useState<ChatMessage>();
  const [error, setError] = useState('');
  const [pending, setPending] = useState('');
  const lock = useRef(false);
  const saved = useRef(new Set<string>());
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [messages, screen]);
  useEffect(() => {
    const v = window.visualViewport;
    const update = () => { document.documentElement.style.setProperty('--chat-height', `${v?.height ?? window.innerHeight}px`); document.documentElement.style.setProperty('--chat-top', `${v?.offsetTop ?? 0}px`); };
    update(); v?.addEventListener('resize', update); v?.addEventListener('scroll', update);
    return () => { v?.removeEventListener('resize', update); v?.removeEventListener('scroll', update); };
  }, []);
  function send(e: React.FormEvent) {
    e.preventDefault(); if (!text.trim()) return;
    const preview = interpret(text, f.currentMonth, f.creditCards, f.categories);
    setMessages(ms => [...ms, { ...message(text.trim(), user.name), authorId:user.id }, { ...message(preview ? 'Confira antes de adicionar' : 'Não consegui entender tudo. Quer preencher manualmente?', 'Contas Tatu', preview ?? undefined), interactionAuthor: { id: user.id, name: user.name } }]);
    setText(''); setError('');
  }
  function complete(id: string, preview?: Preview) {
    saved.current.add(id); setMessages(ms => [...ms.map(m => m.id === id ? { ...m, saved: true, preview: preview ?? m.preview } : m), { ...message('✓ Conta adicionada com sucesso'), interactionAuthor: ms.find(m => m.id === id)?.interactionAuthor ?? { id: user.id, name: user.name } }]);
  }
  async function confirm(m: ChatMessage) {
    if (!m.preview || lock.current || saved.current.has(m.id) || f.busy) return;
    if (!f.ready || !f.submitFinancialCommand) { setError(f.apiErrorStatus === 403 ? ACCESS_MESSAGE : 'Não foi possível conectar. Atualize os dados e tente novamente.'); return; }
    lock.current = true; setPending(m.id); setError('');
    try { const cmd = previewCommand(m.preview); if (await f.submitFinancialCommand(cmd.action, cmd.data, m.preview.month)) complete(m.id); }
    finally { lock.current = false; setPending(''); }
  }
  if (screen !== 'conversation') return <MobileManual initialScreen={screen} onBack={() => setScreen('conversation')} />;
  const p = correction?.preview;
  const kind: EntryKind = p?.count && p.count > 1 ? 'installment' : p?.cardId ? 'card' : 'account';
  return <div className="mobile-app chat-app" data-testid="mobile-app">
    <header className="chat-header"><img src="/icons/tatu-mobile.webp" alt="" width="46" height="46" /><div><h1>Contas Tatu<span>.</span></h1><p>Grupo da casa</p></div><button aria-label="Menu" className="mobile-icon-button" onClick={() => setSheet('menu')}><Menu size={21} /></button></header>
    <div className="chat-members"><ChatParticipant name="Henrique" avatarOnly /><ChatParticipant name="Jéssica" avatarOnly /><span>Henrique e Jéssica</span><button onClick={() => { setAnchor(f.currentMonth); setSheet('months'); }}>{formatMonthYear(f.currentMonth)} <ChevronDown size={14} /></button></div>
    <main className="chat-stream" role="log" aria-label="Conversa da casa" aria-live="polite"><p className="chat-note">CONTAS EM DIA, CASA MAIS LEVE</p>{messages.map(m => <article key={m.id} className={`chat-message ${m.role} ${m.role === 'user' && participantTone(m.authorName) === 'jessica' ? 'local-jessica' : ''}`}>
      {m.role === 'assistant' ? <img className="chat-tatu" src="/icons/tatu-mobile.webp" alt="" /> : <ChatParticipant name={m.authorName} avatarOnly />}
      <div className="chat-bubble"><div className="chat-byline"><b>{m.authorName}</b><time dateTime={m.createdAt}>{new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</time></div><p>{m.text}</p>
        {m.interactionAuthor && <div className="chat-interaction-author"><ChatParticipant name={m.interactionAuthor.name} /></div>}
        {m.preview && <div className="chat-preview"><h2>{m.preview.name}</h2><strong>{formatBRL(m.preview.amount)}</strong><p>{formatMonthYear(m.preview.month)}{m.preview.paid ? ' · Paga' : ''}</p>{m.preview.count > 1 && <p>{m.preview.count} parcelas de {formatBRL(m.preview.amount / m.preview.count)}</p>}{m.preview.cardName && <p>{m.preview.cardName}</p>}<span className="chat-category" style={{ color: f.categories.find(c => c.id === m.preview?.categoryId)?.color }}>{f.categories.find(c => c.id === m.preview?.categoryId)?.name ?? 'Sem categoria'} · sugerida</span>
          {m.saved ? <p className="chat-saved"><Check size={16} /> Adicionada</p> : <div className="chat-actions"><button className="mobile-primary" disabled={!!pending || f.busy} onClick={() => void confirm(m)}>{pending === m.id ? 'Salvando…' : 'Adicionar'}</button><button disabled={!!pending || f.busy} onClick={() => setCorrection(m)}>Corrigir</button></div>}</div>}
        {!m.preview && m.text.startsWith('Não consegui') && <button className="mobile-secondary" onClick={() => setScreen('choose')}>Ir para Geral</button>}
      </div></article>)}<div ref={end} /></main>
    <footer className="chat-footer">{(error || f.operationError) && <div className="chat-error" role="alert">{error || (f.apiErrorStatus === 403 ? ACCESS_MESSAGE : f.operationError)}<button onClick={f.refresh}>Atualizar dados</button></div>}<div className="chat-tools"><button onClick={() => setScreen('choose')}>＋ Geral</button><span className="chat-current-participant"><ChatParticipant name={user.name} /><span>·</span><button onClick={() => void logout()}>Sair</button></span></div><form className="chat-composer" onSubmit={send}><input aria-label="Digite sua conta" placeholder="Digite sua conta..." maxLength={300} value={text} onChange={e => setText(e.target.value)} enterKeyHint="send" /><button type="submit" aria-label="Enviar" disabled={!text.trim()}><Send size={21} /></button></form></footer>
    {sheet && <MobileSheet title={sheet === 'menu' ? 'Seu Contas Tatu' : 'Selecionar mês'} onClose={() => setSheet(undefined)}>{sheet === 'menu' ? <div className="mobile-sheet-actions">{(['Conversa', 'Geral', 'Contas deste mês', 'Selecionar mês'] as const).map((label, i) => <button key={label} onClick={() => { if (i === 3) { setAnchor(f.currentMonth); setSheet('months'); } else { setScreen(i === 1 ? 'choose' : i === 2 ? 'list' : 'conversation'); setSheet(undefined); } }}>{label}</button>)}</div> : <div className="mobile-month-list">{Array.from({ length: 12 }, (_, i) => addMonths(anchor, -i)).map(month => <button key={month} onClick={() => { f.setCurrentMonth(month); setSheet(undefined); }}>{formatMonthYear(month)}{month === f.currentMonth && <Check size={18} />}</button>)}<button onClick={() => setAnchor(addMonths(anchor, -12))}>Meses anteriores</button></div>}</MobileSheet>}
    {correction && p && <MobileSheet title="Corrigir lançamento" onClose={() => { if (!f.busy) setCorrection(undefined); }}><div className="chat-interaction-author"><ChatParticipant name={correction.interactionAuthor?.name ?? user.name} /></div><MobileEntryForm kind={kind} initial={p} onSuccess={result => { complete(correction.id, result.preview); setCorrection(undefined); }} /></MobileSheet>}
  </div>;
}
