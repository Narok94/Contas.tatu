import React,{useEffect,useRef,useState} from 'react';
import { BackupApiError,createBackupApi,type SavedPoint,type BackupOperation } from '../services/backupApi';

const api=createBackupApi();
const buttonClass='text-xs text-stone-600 hover:text-stone-900 border border-stone-200 hover:bg-stone-50 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
export function DataSafetySection(){
  const [available,setAvailable]=useState(false),[checking,setChecking]=useState(true),[busy,setBusy]=useState(false);
  const [message,setMessage]=useState(''),[points,setPoints]=useState<SavedPoint[]|null>(null);
  const [pending,setPending]=useState<BackupOperation[]>([]);
  const alive=useRef(true),lock=useRef(false);
  function fail(error:unknown){if(!alive.current)return;if(error instanceof BackupApiError && error.unconfigured)setAvailable(false);setMessage(error instanceof BackupApiError?error.message:new BackupApiError().message);}
  useEffect(()=>{
    alive.current=true;const controller=new AbortController();
    api.status(controller.signal).then(status=>{if(alive.current){setAvailable(status.available===true);setMessage(status.available===true?'':new BackupApiError(true).message);}}).catch(error=>{if(!controller.signal.aborted)fail(error);}).finally(()=>{if(alive.current)setChecking(false);});
    return()=>{alive.current=false;controller.abort();};
  },[]);
  useEffect(()=>{
    if(!pending.length)return;
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
    const deadline=Date.now()+120000;
    async function poll(){
      try{
        const operations=await Promise.all(pending.map(op=>api.operation(op.id,controller.signal)));
        if(controller.signal.aborted)return;
        if(operations.some(op=>['failed','cancelled','cancelling'].includes(op.status))){setPending([]);setMessage('O Neon não concluiu o ponto seguro. Confira os pontos salvos antes de tentar novamente.');return;}
        if(operations.every(op=>op.status==='finished')){setPending([]);setMessage('Ponto seguro criado.');return;}
        if(Date.now()>=deadline){setPending([]);setMessage('Criação ainda não confirmada. Consulte os pontos salvos em instantes; não crie novamente agora.');return;}
        timer=setTimeout(()=>void poll(),2000);
      }catch(error){if(!controller.signal.aborted){setPending([]);fail(error);}}
    }
    timer=setTimeout(()=>void poll(),1500);
    return()=>{controller.abort();clearTimeout(timer);};
  },[pending]);
  async function create(){
    if(lock.current || !available || pending.length)return;lock.current=true;setBusy(true);setMessage('');
    try{const result=await api.create();if(!alive.current)return;
      const running=result.operations.filter(op=>op.status!=='finished');
      if(running.some(op=>['failed','cancelled','cancelling'].includes(op.status)))throw new BackupApiError();
      setPending(running);setMessage(running.length?'Criando ponto seguro…':'Ponto seguro criado.');
      setPoints(previous=>previous===null?null:[result.snapshot,...previous.filter(p=>p.id!==result.snapshot.id)]);
    }catch(error){fail(error);}finally{lock.current=false;if(alive.current)setBusy(false);}
  }
  async function list(){
    if(lock.current || !available)return;lock.current=true;setBusy(true);
    try{const result=await api.list();if(alive.current)setPoints(result.snapshots);}catch(error){fail(error);}finally{lock.current=false;if(alive.current)setBusy(false);}
  }
  return <section aria-labelledby="data-safety-title" className="pt-4 border-t border-stone-200">
    <h3 id="data-safety-title" className="text-xs font-semibold text-stone-700">Segurança dos dados</h3>
    <div className="flex flex-wrap gap-2 mt-2"><button type="button" className={buttonClass} disabled={checking || !available || busy || !!pending.length} onClick={()=>void create()}>Criar ponto seguro</button><button type="button" className={buttonClass} disabled={checking || !available || busy} onClick={()=>void list()}>Ver pontos salvos</button></div>
    {checking?<p className="mt-2 text-xs text-stone-500" role="status">Verificando disponibilidade…</p>:message && <p className="mt-2 text-xs text-stone-500" role="status">{message}</p>}
    {points!==null && <div className="mt-3 text-xs text-stone-600">{points.length?<ul className="space-y-2 max-h-40 overflow-y-auto" aria-label="Pontos salvos">{points.map(point=><li key={point.id} className="border-b border-stone-100 pb-2"><time dateTime={point.timestamp??point.createdAt}>{new Date(point.timestamp??point.createdAt).toLocaleString('pt-BR')}</time>{point.expiresAt && <span className="block text-stone-500">{Date.parse(point.expiresAt)<=Date.now()?'Expirado em':'Disponível até'} {new Date(point.expiresAt).toLocaleString('pt-BR')}</span>}</li>)}</ul>:<p>Nenhum ponto salvo.</p>}</div>}
  </section>;
}
