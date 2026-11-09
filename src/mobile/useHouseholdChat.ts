import { useEffect, useRef, useState } from 'react';
import { createChatApi, type ChatPage } from '../services/chatApi';
import type { ChatMessage } from './conversation';

const api=createChatApi();
export function useHouseholdChat(search:string,author:string) {
  const [messages,setMessages]=useState<ChatMessage[]>([]);
  const [participants,setParticipants]=useState<ChatPage['participants']>([]);
  const [nextBefore,setNextBefore]=useState<string|null>(null);
  const [ready,setReady]=useState(false), [error,setError]=useState('');
  const epoch=useRef(0);
  const newest=useRef<string>();
  const active=useRef(false), filter=useRef({q:search,author});
  filter.current={q:search,author};
  function merge(incoming:ChatMessage[], historyStart?:string|null) {
    setMessages(previous=>{
      const merged=new Map<string,ChatMessage>(previous.filter(m=>historyStart===undefined || (historyStart!==null && BigInt(m.sequence!)>=BigInt(historyStart))).map(m=>[m.id,m] as const));
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
      if(page.historyStart===null){newest.current=undefined;setNextBefore(null);}
      merge(page.messages,page.historyStart);setParticipants(page.participants);setReady(true);setError('');
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
    const cleared=()=>{++epoch.current;newest.current=undefined;setMessages([]);setNextBefore(null);void refresh(undefined,true);};
    window.addEventListener('chat-cleared',cleared);
    const focused=()=>void refresh();window.addEventListener('focus',focused);
    return()=>{++epoch.current;active.current=false;window.clearInterval(timer);window.removeEventListener('chat-cleared',cleared);window.removeEventListener('focus',focused);};
  },[search,author]);
  return {messages,participants,nextBefore,ready,error,refresh};
}
