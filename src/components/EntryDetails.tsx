import { useFinance } from '../context/FinanceContext';
import { entryMetadata, type EntryType } from '../utils/entryOrigins';
import './entryDetails.css';

/** Native disclosure is keyboard accessible and never triggers edit/payment actions. */
export function EntryDetails({ type, id, name, nameAsTrigger = false }: { type: EntryType; id: string; name: string; nameAsTrigger?: boolean }) {
  const { store } = useFinance();
  const meta = entryMetadata(store, type, id);
  const date = meta.createdAt ? new Date(meta.createdAt) : undefined;
  return <details className={`entry-details ${nameAsTrigger ? 'entry-details-title' : ''}`}>
    <summary aria-label={`Quem adicionou ${name}?`}>{nameAsTrigger ? name : 'Quem adicionou?'}</summary>
    <dl>
      <div><dt>Adicionado por</dt><dd>{meta.authorName ?? 'Autor não registrado'}</dd></div>
      <div><dt>Data do cadastro</dt><dd>{date && Number.isFinite(date.getTime()) ? date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : 'Data não registrada'}</dd></div>
    </dl>
  </details>;
}
