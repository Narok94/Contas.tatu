import { navigationHeaders } from '../auth/navigationSession';
export interface SavedPoint {id:string;name:string;createdAt:string;timestamp?:string;expiresAt:string|null}
export interface BackupOperation {id:string;status:string}
export class BackupApiError extends Error {
  constructor(public unconfigured=false){super(unconfigured?'Pontos seguros indisponíveis: a configuração administrativa do Neon ainda não está pronta no servidor.':'Não foi possível concluir a operação. Confira os pontos salvos antes de tentar criar novamente.');}
}
export function createBackupApi(fetcher:typeof fetch=globalThis.fetch.bind(globalThis)){
  async function request<T>(query='',post=false,signal?:AbortSignal):Promise<T>{
    try{
      const response=await fetcher('/api/backup'+query,{method:post?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:{...navigationHeaders(),...(post?{'Content-Type':'application/json'}:{})},body:post?'{}':undefined,signal:signal??AbortSignal.timeout(45000)});
      if(response.status===401 && typeof window!=='undefined')window.dispatchEvent(new Event('auth-expired'));
      const body=await response.json();
      if(!response.ok)throw new BackupApiError(body?.code==='BACKUP_NOT_CONFIGURED');
      return body;
    }catch(error){if(signal?.aborted)throw error;throw error instanceof BackupApiError?error:new BackupApiError();}
  }
  return {
    status:(signal?:AbortSignal)=>request<{available:boolean;message?:string}>('?view=status',false,signal),
    list:()=>request<{snapshots:SavedPoint[]}>(),
    create:()=>request<{snapshot:SavedPoint;operations:BackupOperation[]}>('',true),
    operation:(id:string,signal?:AbortSignal)=>request<BackupOperation>('?operation='+encodeURIComponent(id),false,signal),
  };
}
