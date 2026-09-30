import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export function MobileSheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; dialog.showModal();
    return () => { dialog.close(); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  return <dialog ref={ref} className="mobile-sheet" aria-label={title} onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => {
    if (e.target !== e.currentTarget) return;
    const r = e.currentTarget.getBoundingClientRect();
    if (e.clientY < r.top || e.clientY > r.bottom) onClose();
  }}>
    <div className="mobile-sheet-handle" aria-hidden="true" />
    <div className="mobile-sheet-heading"><h2>{title}</h2><button type="button" aria-label="Fechar" className="mobile-icon-button" onClick={onClose}><X size={22} /></button></div>
    {children}
  </dialog>;
}
