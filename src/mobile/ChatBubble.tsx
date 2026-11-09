import type { ReactNode } from 'react';
import { ChatParticipant, participantTone } from './ChatParticipant';

export function ChatBubble({ role, name, createdAt, children }: {
  role: 'user' | 'assistant'; name: string; createdAt?: string; children: ReactNode;
}) {
  const tone = role === 'user' && participantTone(name) === 'jessica' ? ' local-jessica' : '';
  return <article className={`chat-message ${role}${tone}`}>
    {role === 'assistant' ? <img className="chat-tatu" src="/icons/tatu-mobile.webp" alt="" /> : <ChatParticipant name={name} avatarOnly />}
    <div className="chat-bubble">
      <div className="chat-byline"><b>{name}</b>{createdAt && <time dateTime={createdAt}>{new Date(createdAt).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</time>}</div>
      {children}
    </div>
  </article>;
}
