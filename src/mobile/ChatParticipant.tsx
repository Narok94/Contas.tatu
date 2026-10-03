import React from 'react';
import henriqueAvatar from '../assets/tatu/tatu-henrique.png';
import jessicaAvatar from '../assets/tatu/tatu-jessica.png';

export function participantTone(name: string) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase() === 'jessica' ? 'jessica' : 'henrique';
}

export function ChatParticipant({ name, avatarOnly = false }: { name: string; avatarOnly?: boolean }) {
  return <span className={`chat-participant ${participantTone(name)}`} aria-label={avatarOnly ? name : undefined}>
    <span className="chat-participant-avatar"><img src={participantTone(name) === 'jessica' ? jessicaAvatar : henriqueAvatar} alt="" /><span aria-hidden="true">{name[0]}</span></span>
    {!avatarOnly && <span className="chat-participant-name">{name}</span>}
  </span>;
}
