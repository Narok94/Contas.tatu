import type { ChatMessage, GuidedExpense, Preview } from '../mobile/conversation';
import { navigationHeaders } from '../auth/navigationSession';
export interface ChatPage { messages: ChatMessage[]; participants: {id:string;name:string}[]; nextBefore: string|null; historyStart: string|null }
export function createChatApi(fetcher: typeof fetch = globalThis.fetch.bind(globalThis)) {
  async function request<T>(url:string, body?:unknown, method=body===undefined?'GET':'POST'):Promise<T> {
    const response=await fetcher(url,{method,credentials:'same-origin',cache:'no-store',
      headers:{...navigationHeaders(),...(body===undefined?{}:{'Content-Type':'application/json'})},
      body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(25000)});
    if (response.status===401 && typeof window!=='undefined') window.dispatchEvent(new Event('auth-expired'));
    if (!response.ok) throw new Error(response.status===409 ? 'A conversa ou as contas mudaram. Atualize antes de tentar novamente.' : 'Não foi possível carregar ou salvar a conversa. Tente novamente.');
    return response.json();
  }
  return {
    clear: ()=>request<{deleted:number}>('/api/chat',{confirmed:true},'DELETE'),
    list: (query:{before?:string;q?:string;author?:string}={})=>request<ChatPage>('/api/chat?'+new URLSearchParams(query)),
    send: (id:string,text:string,month:string,replyTo?:string)=>request<{messages:ChatMessage[]}>('/api/chat',{id,text,month,replyTo}),
    confirm: (id:string,expectedRevision:string,preview?:Preview)=>request<{alreadySaved:boolean;message:ChatMessage}>('/api/chat/confirm',{id,expectedRevision,preview}),
    confirmGuided: (id:string,expectedRevision:string,guidedExpense:GuidedExpense)=>request<{alreadySaved:boolean;message:ChatMessage}>('/api/chat/confirm',{id,expectedRevision,guidedExpense}),
  };
}
