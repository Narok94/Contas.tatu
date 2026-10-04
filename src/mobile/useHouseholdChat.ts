import { useEffect, useRef, useState } from 'react';
import { createChatApi, type ChatPage } from '../services/chatApi';
import { createFinanceApi } from '../services/financeApi';
import type { ChatMessage, Preview } from './conversation';

const api=createChatApi();
export function useHouseholdChat(search:string,author:string) {
  const [messages,setMessages]=useState<ChatMessage[]>([]);
  const [participants,setParticipants]=useState<ChatPage['participants']>([]);
  const [nextBefore,setNextBefore]=useState<string|null>(null);
  const [ready,setReady]=useState(false), [busy,setBusy]=useState(false), [error,setError]=useState('');
  const epoch=useRef(0), lock=useRef(false), sending=useRef<{id:string;text:string;month:string;replyTo?:string}>();
  const newest=useRef<string>();
  const active=useRef(false), filter=useRef({q:search,author});
  filter.current={q:search,author};
  function merge(incoming:ChatMessage[]) {
    setMessages(previous=>{
      const merged=new Map<string,ChatMessage>(previous.map(m=>[m.id,m] as const));
      for(const m of incoming){const old=merged.get(m.id);merged.set(m.id,old?.saved && !m.saved?old:m);}
      return [...merged.values()].sort((a,b)=>BigInt(a.sequence!)<BigInt(b.sequence!)?-1:1);
    });
  }
  async function refresh(before?:string,initial=false) {
    if(!active.current)return;
    const current=epoch.current;
    try {
      const page=await api.list({...filter.current,...(before?{before}:{})});
      if(current!==epoch.current)return;
      merge(page.messages);setParticipants(page.participants);setReady(true);setError('');
      // A long pause may skip a whole page of new messages. Reopen the cursor at
      // the gap so every intervening message remains reachable through history.
      const gap=!before && newest.current && page.messages.length && BigInt(page.messages[0].sequence!)>BigInt(newest.current);
      if(initial || before || gap || !newest.current)setNextBefore(page.nextBefore);
      const last=page.messages.at(-1)?.sequence;
      if(last && (!newest.current || BigInt(last)>BigInt(newest.current)))newest.current=last;
    } catch(e) { if(current===epoch.current)setError(e instanceof Error?e.message:'Não foi possível carregar a conversa.'); }
  }
  useEffect(()=>{
    ++epoch.current;active.current=true;newest.current=undefined;setMessages([]);setNextBefore(null);setReady(false);void refresh(undefined,true);
    const timer=window.setInterval(()=>void refresh(),5000);
    const focused=()=>void refresh();window.addEventListener('focus',focused);
    return()=>{++epoch.current;active.current=false;window.clearInterval(timer);window.removeEventListener('focus',focused);};
  },[search,author]);
  async function send(text:string,month:string,replyTo?:string) {
    if(lock.current || !ready)return false;
    lock.current=true;setBusy(true);setError('');
    if(!sending.current || sending.current.text!==text || sending.current.month!==month || sending.current.replyTo!==replyTo)sending.current={id:crypto.randomUUID(),text,month,replyTo};
    try { const input=sending.current;await api.send(input.id,input.text,input.month,input.replyTo);sending.current=undefined;await refresh();return true; }
    catch {setError('Não foi possível confirmar o envio. Tente novamente para verificar e salvar a mesma mensagem.');return false;}
    finally {lock.current=false;setBusy(false);}
  }
  async function confirm(message:ChatMessage,preview?:Preview) {
    if(lock.current || !ready || message.saved || !message.preview)return false;
    lock.current=true;setBusy(true);setError('');
    const current=epoch.current;
    try {
      const view=await createFinanceApi().read((preview??message.preview).month);
      const result=await api.confirm(message.id,view.revision,preview);
      if(current===epoch.current)merge([result.message]);
      await refresh();return true;
    } catch(e) {await refresh();setError(e instanceof Error?e.message:'Não foi possível confirmar. Atualize a conversa antes de tentar novamente.');return false;}
    finally {lock.current=false;setBusy(false);}
  }
  return {messages,participants,nextBefore,ready,busy,error,refresh,send,confirm};
}
