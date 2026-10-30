import React, { useRef, useState } from 'react';
import { ConfirmDialog } from './ConfirmDialog';
import { createChatApi } from '../services/chatApi';

export function ClearConversation({ disabled=false, onCleared }: { disabled?: boolean; onCleared?: () => void }) {
  const [open,setOpen]=useState(false), [busy,setBusy]=useState(false), [error,setError]=useState('');
  const lock=useRef(false);
  async function clear() {
    if(lock.current)return;
    lock.current=true;setBusy(true);setError('');
    try {
      await createChatApi().clear();
      window.dispatchEvent(new Event('chat-cleared'));
      setOpen(false);onCleared?.();
    } catch { setError('Não foi possível limpar a conversa. Tente novamente.'); }
    finally {lock.current=false;setBusy(false);}
  }
  return <>
    <button type="button" disabled={disabled || busy} onClick={()=>{setError('');setOpen(true);}}>Limpar conversa</button>
    <ConfirmDialog isOpen={open} title="Limpar conversa" message="Apenas as mensagens do chat da casa serão apagadas. Contas e todos os dados financeiros permanecerão intactos. Você continuará conectado. Deseja confirmar?"
      confirmLabel={busy ? 'Limpando…' : 'Sim, limpar conversa'} onConfirm={()=>void clear()} onCancel={()=>{if(!lock.current)setOpen(false);}} />
    {error && <p role="alert">{error}</p>}
  </>;
}
