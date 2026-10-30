import React, { useLayoutEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface CardDetailsDialogProps {
  id: string;
  name: string;
  month: string;
  total: string;
  onClose: () => void;
  children: React.ReactNode;
}

export function CardDetailsDialog({ id, name, month, total, onClose, children }: CardDetailsDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const backdropStart = useRef(false);

  useLayoutEffect(() => {
    const dialog = ref.current!;
    const trigger = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);

  const isBackdrop = (event: React.PointerEvent<HTMLDialogElement>) => {
    if (event.target !== event.currentTarget) return false;
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
  };

  return (
    <dialog ref={ref} id={id} className="card-details-dialog" aria-labelledby={`${id}-title`}
      aria-modal="true" onCancel={event => { event.preventDefault(); onClose(); }}
      onKeyDown={event => {
        if (event.key !== 'Tab') return;
        const dialog = ref.current as HTMLDialogElement;
        const controls = Array.from(dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
        )).filter(element => element.getClientRects().length > 0);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first?.focus();
        }
      }}
      onPointerDown={event => { backdropStart.current = isBackdrop(event); }}
      onPointerUp={event => {
        if (backdropStart.current && isBackdrop(event)) onClose();
        backdropStart.current = false;
      }}>
      <header className="card-details-header">
        <div>
          <p>Fatura de cartão · {month}</p>
          <h2 id={`${id}-title`}>{name}</h2>
          <strong>{total}</strong>
        </div>
        <button type="button" autoFocus aria-label="Fechar detalhes do cartão" onClick={onClose}>
          <X size={22} />
        </button>
      </header>
      <div className="card-details-content">{children}</div>
    </dialog>
  );
}
