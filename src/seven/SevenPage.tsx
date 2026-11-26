import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { MonthSelector } from '../components/MonthSelector';
import { useFinance } from '../context/FinanceContext';
import { canAccessSeven, type SevenExpense, type SevenMonth, type SevenImage } from './model';
import { sevenRequest } from './api';
import { money, monthlyReport } from './report';
import './seven.css';

function readImage(file:File):Promise<SevenImage> {
  return new Promise((resolve,reject)=>{
    if(!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size>1024*1024) {reject(new Error('Use PNG, JPEG ou WebP de até 1 MB por imagem.'));return;}
    const reader=new FileReader();reader.onerror=()=>reject(new Error('Não foi possível ler a imagem.'));
    reader.onload=()=>resolve({name:file.name.slice(0,200),data:String(reader.result)});reader.readAsDataURL(file);
  });
}
export default function SevenPage() {
  const {user}=useAuth();
  return canAccessSeven(user) ? <SevenContent /> : <p>Acesso não permitido.</p>;
}
function SevenContent() {
  const {currentMonth}=useFinance();
  const [month,setMonth]=useState(currentMonth);
  const [data,setData]=useState<SevenMonth>();
  const [reload,setReload]=useState(0);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);
  const lock=useRef(false);
  const [draft,setDraft]=useState<SevenExpense>();
  const [view,setView]=useState<SevenExpense>();
  const [amount,setAmount]=useState('');
  const formHeading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{
    let live=true;setData(undefined);setError('');
    sevenRequest<SevenMonth>('?month='+month).then(v=>{if(live)setData(v);}).catch(e=>{if(live)setError(e.message);});
    return ()=>{live=false;};
  },[month,reload]);
  useEffect(()=>{if(draft)formHeading.current?.focus();},[draft?.id]);
  async function run(action:()=>Promise<void>) {
    if(lock.current)return;lock.current=true;setBusy(true);setError('');setNotice('');
    try {await action();}catch(e){setError(e instanceof Error ? e.message : 'Não foi possível concluir.');}
    finally{lock.current=false;setBusy(false);}
  }
  function refresh(){setView(undefined);setDraft(undefined);setReload(n=>n+1);}
  function edit(e:SevenExpense){setView(undefined);setDraft(e);setAmount((e.cents/100).toFixed(2).replace('.',','));}
  const field=(key:'description'|'location'|'date'|'notes',value:string)=>setDraft(d=>d?{...d,[key]:value}:d);
  return <section className="seven-page" aria-label="Comprovante Seven">
    <header><h1>Comprovante Seven</h1><p>Despesas de trabalho e seus comprovantes, em um só lugar.</p><small>Registro exclusivo do Henrique. Não altera saldos ou pagamentos das contas.</small></header>
    <fieldset disabled={busy} className="seven-controls"><legend className="sr-only">Período e ações</legend>
      <MonthSelector currentMonth={month} onMonthChange={m=>{setMonth(m);setDraft(undefined);setView(undefined);setNotice('');}} />
      <strong>Total mensal: {data ? money(data.totalCents) : '—'}</strong>
      <div className="seven-actions"><button onClick={()=>edit({id:crypto.randomUUID(),description:'',location:'',date:month+'-01',cents:0,notes:'',accountId:null,images:[],version:0})}>Nova despesa</button>
      <button disabled={!data} onClick={()=>void run(async()=>{
        const rows=await sevenRequest<SevenMonth>('?month='+month);
        const expenses:SevenExpense[]=[];
        for(const row of rows.expenses) expenses.push(await sevenRequest<SevenExpense>('?id='+row.id));
        if(expenses.some(e=>e.date.slice(0,7)!==month || e.version!==rows.expenses.find(r=>r.id===e.id)?.version)) throw new Error('Os registros mudaram. Gere o relatório novamente.');
        const url=URL.createObjectURL(new Blob([monthlyReport(month,expenses)],{type:'text/html;charset=utf-8'}));
        const link=document.createElement('a');link.href=url;link.download=`comprovante-seven-${month}.html`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
        setNotice('Relatório baixado com os comprovantes incorporados. Abra o arquivo para visualizar ou imprimir em PDF.');
      })}>Relatório mensal</button><button onClick={refresh}>Atualizar</button></div>
    </fieldset>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}{busy && <p role="status">Processando…</p>}
    {draft && <form className="seven-card" onSubmit={event=>{event.preventDefault();void run(async()=>{
      if(!/^\d{1,7}([,.]\d{1,2})?$/.test(amount))throw new Error('Informe um valor válido, como 27,50.');
      await sevenRequest('','POST',{...draft,cents:Math.round(Number(amount.replace(',','.'))*100)});
      const target=draft.date.slice(0,7);refresh();setMonth(target);setNotice('Despesa salva.');
    });}}>
      <h2 ref={formHeading} tabIndex={-1}>{draft.version ? 'Editar despesa' : 'Nova despesa'}</h2>
      <fieldset disabled={busy}><legend className="sr-only">Dados da despesa</legend>
        <label>Vincular a uma conta existente (opcional)<select value={draft.accountId ?? ''} onChange={e=>{
          const account=data?.accounts.find(a=>a.id===e.target.value);
          setDraft({...draft,accountId:e.target.value || null,...(account?{description:account.name,cents:account.cents}:{})});if(account)setAmount((account.cents/100).toFixed(2).replace('.',','));
        }}><option value="">Sem vínculo</option>{draft.accountId && !data?.accounts.some(a=>a.id===draft.accountId) && <option value={draft.accountId}>Conta vinculada em outro mês</option>}{data?.accounts.map(a=><option key={a.id} value={a.id}>{a.name} — {money(a.cents)}</option>)}</select></label>
        <small>Contas avulsas do mês selecionado. O vínculo não cria outra despesa financeira.</small>
        <label>Descrição<input required maxLength={200} value={draft.description} onChange={e=>field('description',e.target.value)} /></label>
        <label>Cliente/local<input required maxLength={200} value={draft.location} onChange={e=>field('location',e.target.value)} /></label>
        <div className="seven-columns"><label>Data<input required type="date" min="2000-01-01" max="2099-12-31" value={draft.date} onChange={e=>field('date',e.target.value)} /></label><label>Valor (R$)<input required inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} /></label></div>
        <label>Observação (opcional)<textarea maxLength={2000} value={draft.notes} onChange={e=>field('notes',e.target.value)} /></label>
        <label>Imagens/prints<input type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={event=>{
          const files=Array.from(event.target.files ?? []);event.target.value='';
          void run(async()=>{
            if(draft.images.length+files.length>10)throw new Error('Anexe no máximo 10 imagens.');
            const added=await Promise.all(files.map(readImage));const images=[...draft.images,...added];
            if(images.reduce((n,i)=>n+i.data.length,0)>3*1024*1024)throw new Error('Os anexos juntos devem ocupar até 3 MB.');
            setDraft({...draft,images});
          });
        }} /></label><small>De 1 a 10 imagens; até 1 MB cada e 3 MB no conjunto.</small>
        <div className="seven-images">{draft.images.map((i,index)=><figure key={index}><img src={i.data} alt={i.name} /><figcaption>{i.name}</figcaption><button type="button" onClick={()=>setDraft({...draft,images:draft.images.filter((_,n)=>n!==index)})}>Remover imagem {index+1}</button></figure>)}</div>
        <div className="seven-actions"><button type="submit" disabled={!draft.images.length}>Salvar despesa</button><button type="button" onClick={()=>setDraft(undefined)}>Cancelar</button></div>
      </fieldset>
    </form>}
    {view && <article className="seven-card"><h2>{view.description}</h2><p>{view.date.split('-').reverse().join('/')} · {view.location} · {money(view.cents)}</p><p>{view.notes}</p>{view.accountId && <p>Vinculada a uma conta existente.</p>}
      <div className="seven-actions"><button disabled={busy} onClick={()=>edit(view)}>Editar despesa</button><button onClick={()=>setView(undefined)}>Fechar comprovantes</button></div>
      <div className="seven-images seven-full">{view.images.map((i,n)=><figure key={n}><img src={i.data} alt={`Comprovante ${n+1}: ${i.name}`} /><figcaption><a href={i.data} download={i.name}>Baixar {i.name}</a></figcaption></figure>)}</div></article>}
    {!data && !error && <p role="status">Carregando despesas…</p>}
    {data?.expenses.length===0 && <p>Nenhuma despesa neste mês.</p>}
    <div className="seven-list">{data?.expenses.map(e=><article className="seven-card" key={e.id}><h2>{e.description}</h2><p>{e.location}</p><p>{e.date.split('-').reverse().join('/')} · <strong>{money(e.cents)}</strong> · {e.imageCount} print(s)</p>
      <div className="seven-actions"><button disabled={busy} onClick={()=>void run(async()=>{setDraft(undefined);setView(await sevenRequest<SevenExpense>('?id='+e.id));})}>Ver comprovantes</button><button disabled={busy} onClick={()=>void run(async()=>edit(await sevenRequest<SevenExpense>('?id='+e.id)))}>Editar</button><button disabled={busy} onClick={()=>{
        if(window.confirm(`Excluir “${e.description}” e seus comprovantes? A conta vinculada será preservada.`))void run(async()=>{await sevenRequest('','DELETE',{id:e.id,version:e.version});refresh();setNotice('Despesa excluída.');});
      }}>Excluir</button></div></article>)}</div>
  </section>;
}
