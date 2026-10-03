import React, { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, Check } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { formatBRL, formatMonthYear } from '../utils/formatters';
import { emptyPhotoAccount, parsePhotoAccounts, photoAccountCommand, type PhotoAccount } from './photoAccounts';
import './photoAccounts.css';

type ReviewRow = PhotoAccount & { id: string; saved?: boolean };
const reviewRow = (row: PhotoAccount): ReviewRow => ({ ...row, id: crypto.randomUUID() });
export function PhotoAccountEntry() {
  const f = useFinance();
  const camera = useRef<HTMLInputElement>(null), gallery = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController>();
  const active = useRef(true), saving = useRef(false);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [month, setMonth] = useState(f.currentMonth);
  const [reading, setReading] = useState(false), [progress, setProgress] = useState(0);
  const [error, setError] = useState(''), [pending, setPending] = useState('');
  const [photo, setPhoto] = useState('');
  useEffect(() => { active.current = true; return () => { active.current = false; abort.current?.abort(); }; }, []);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo); }, [photo]);
  async function select(file?: File) {
    if (!file || reading || saving.current) return;
    if (rows.some(row => !row.saved) && !window.confirm('Trocar a foto descarta as prévias ainda não adicionadas. Continuar?')) return;
    const controller = new AbortController(); abort.current = controller;
    setReading(true); setProgress(0); setError(''); setRows([]);
    if (!file.type.startsWith('image/') || file.size > 15 * 1024 * 1024) {
      setError('Escolha uma foto de até 15 MB.'); setReading(false); return;
    }
    setPhoto(URL.createObjectURL(file));
    const timeout = window.setTimeout(() => controller.abort(), 90_000);
    try {
      const { readPhoto } = await import('./photoOcr');
      const text = await readPhoto(file, controller.signal, value => { if (active.current) setProgress(value); });
      if (!active.current || controller.signal.aborted) return;
      const found = parsePhotoAccounts(text);
      setRows(found.map(reviewRow));
      if (!found.length || found.every(row => !row.amount)) setError('Não consegui ler os valores. Tente uma foto mais nítida ou preencha uma conta manualmente abaixo.');
    } catch (failure) {
      if (active.current) setError(failure instanceof Error && failure.name === 'AbortError'
        ? 'Leitura cancelada ou demorou demais. Tente novamente ou preencha manualmente.'
        : 'Não consegui ler a foto. Confira a conexão para carregar o leitor, use JPG/PNG com boa iluminação ou preencha manualmente.');
    } finally { window.clearTimeout(timeout); if (active.current) setReading(false); }
  }
  function edit(id: string, key: keyof PhotoAccount, value: string) {
    setRows(previous => previous.map(row => row.id === id ? { ...row, [key]: value } : row));
  }
  async function confirm(event: React.FormEvent, row: ReviewRow) {
    event.preventDefault();
    if (saving.current || f.busy || row.saved || reading) return;
    setError('');
    if (!f.ready || !f.submitFinancialCommand) { setError('Atualize seus dados antes de confirmar. Nenhuma conta foi adicionada por esta prévia.'); return; }
    try {
      const command = photoAccountCommand(row, month);
      if (f.store.closedMonths?.[month] || f.store.closedMonths?.[command.month]) { setError('O mês está fechado. Escolha um período aberto antes de confirmar.'); return; }
      saving.current = true; setPending(row.id);
      const ok = await f.submitFinancialCommand(command.action, command.data, command.month);
      if (active.current) {
        if (ok) setRows(previous => previous.map(item => item.id === row.id ? { ...item, saved: true } : item));
        else setError('Não foi possível confirmar. Confira o aviso e os dados atualizados antes de tentar novamente.');
      }
    } catch (failure) { if (active.current) setError(failure instanceof Error ? failure.message : 'Confira os dados antes de confirmar.'); }
    finally { saving.current = false; if (active.current) setPending(''); }
  }
  const disabled = reading || !!pending || f.busy;
  return <div className="photo-entry">
    <p className="mobile-hint">Fotografe uma lista de contas. A leitura acontece neste aparelho; a foto não é enviada ao servidor. Confira tudo antes de adicionar.</p>
    <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={e => { void select(e.target.files?.[0]); e.target.value = ''; }} />
    <input ref={gallery} type="file" accept="image/*" hidden onChange={e => { void select(e.target.files?.[0]); e.target.value = ''; }} />
    <div className="photo-source"><button className="mobile-primary" disabled={disabled} onClick={() => camera.current?.click()}><Camera size={20} /> Tirar foto</button><button className="mobile-primary" disabled={disabled} onClick={() => gallery.current?.click()}><ImagePlus size={20} /> Enviar foto</button></div>
    {photo && <img className="photo-thumbnail" src={photo} alt="Foto selecionada para conferência" />}
    {reading && <div role="status" className="mobile-hint">Lendo a foto… {progress}%<button className="mobile-secondary" onClick={() => abort.current?.abort()}>Cancelar leitura</button></div>}
    {(error || f.operationError) && <p className="mobile-error" role="alert">{error || f.operationError}</p>}
    {rows.length > 0 && <>
      <h3>Confira as contas</h3><p className="mobile-hint">O valor é o da parcela. Sem parcelamento, deixe os dois campos de parcela vazios. Nada é salvo sem confirmação.</p>
      <label className="mobile-field">Mês da conta/parcela<input type="month" required value={month} disabled={disabled || rows.some(row => row.saved)} onChange={e => setMonth(e.target.value)} /></label>
    </>}
    {rows.map((row, index) => {
      let summary = '';
      try { const command = photoAccountCommand(row, month); if (command.count > 1) summary = `${command.count} parcelas · total ${formatBRL(command.total)} · início em ${formatMonthYear(command.month)}. Inclui as parcelas anteriores no cronograma; nenhum pagamento é marcado automaticamente.`; } catch { /* Incomplete OCR stays editable. */ }
      return <form key={row.id} className="photo-review mobile-form" aria-label={`Prévia da conta ${index + 1}`} onSubmit={event => void confirm(event, row)}>
        <fieldset disabled={disabled || row.saved}>
          <label className="mobile-field">Nome<input required maxLength={160} value={row.name} onChange={e => edit(row.id, 'name', e.target.value)} /></label>
          <div className="photo-parcels"><label className="mobile-field">Parcela atual<input inputMode="numeric" pattern="[0-9]*" placeholder="Ex.: 3" value={row.current} onChange={e => edit(row.id, 'current', e.target.value)} /></label><label className="mobile-field">Total de parcelas<input inputMode="numeric" pattern="[0-9]*" placeholder="Ex.: 3" value={row.count} onChange={e => edit(row.id, 'count', e.target.value)} /></label></div>
          <label className="mobile-field">Valor da conta/parcela (R$)<input inputMode="decimal" required value={row.amount} onChange={e => edit(row.id, 'amount', e.target.value)} /></label>
          {summary && <p className="mobile-hint">{summary}</p>}
          {!row.saved && <button className="mobile-primary" type="submit">{pending === row.id ? 'Salvando…' : 'Confirmar e adicionar'}</button>}
          {!row.saved && <button className="mobile-secondary" type="button" onClick={() => setRows(previous => previous.filter(item => item.id !== row.id))}>Descartar esta prévia</button>}
        </fieldset>
        {row.saved && <p className="chat-saved" role="status"><Check size={18} /> Conta adicionada</p>}
      </form>;
    })}
    {!reading && <button className="mobile-secondary" disabled={disabled || rows.length >= 20} onClick={() => setRows(previous => [...previous, reviewRow(emptyPhotoAccount())])}>Preencher outra conta manualmente</button>}
  </div>;
}
