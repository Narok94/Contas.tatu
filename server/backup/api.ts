import { randomUUID } from 'node:crypto';
import type { IncomingMessage,ServerResponse } from 'node:http';
import { authenticated } from '../auth/access.js';
import { createAuthService } from '../auth/service.js';
import { readBody } from '../category-api.js';
import { FoundationError } from '../foundation.js';
import { BackupError,createNeonBackupService } from './neonBackup.js';

export const BACKUP_UNAVAILABLE='Pontos seguros indisponíveis: a configuração administrativa do Neon ainda não está pronta no servidor.';
export function backupHandler(service=createNeonBackupService(),auth=createAuthService()) {
  return async(request:IncomingMessage & {query?:Record<string,string|string[]>;body?:unknown},response:ServerResponse)=>{
    response.setHeader('Content-Type','application/json; charset=utf-8');response.setHeader('Cache-Control','no-store');response.setHeader('X-Content-Type-Options','nosniff');
    const send=(status:number,body:unknown)=>{response.statusCode=status;response.end(JSON.stringify(body));};
    if(!['GET','POST'].includes(request.method??'')){response.setHeader('Allow','GET, POST');send(405,{error:'Método não permitido.'});return;}
    try{
      if(!await authenticated(request,auth)){send(401,{error:'Entre para continuar.'});return;}
      const query=request.query??{};
      if(Object.keys(query).some(k=>!['view','operation'].includes(k)) || Object.keys(query).length>1 || query.view!==undefined && query.view!=='status')throw new FoundationError(400,'Requisição inválida.');
      if(request.method==='GET' && query.view==='status'){send(200,{available:service.configured(),message:service.configured()?undefined:BACKUP_UNAVAILABLE});return;}
      if(!service.configured()){send(503,{code:'BACKUP_NOT_CONFIGURED',error:BACKUP_UNAVAILABLE});return;}
      if(request.method==='POST'){
        if(Object.keys(query).length)throw new FoundationError(400,'Requisição inválida.');
        const body=await readBody(request);
        if(!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).length)throw new FoundationError(400,'Requisição inválida.');
        const name=`ponto-seguro-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID().slice(0,8)}`;
        const result=await service.create(name);
        send(202,{snapshot:result.snapshot,operations:result.operations});return;
      }
      if(query.operation!==undefined){
        if(typeof query.operation!=='string')throw new FoundationError(400,'Requisição inválida.');
        send(200,await service.operation(query.operation));return;
      }
      send(200,{snapshots:await service.list()});
    }catch(error){
      if(error instanceof FoundationError){send(error.status,{error:error.message});return;}
      if(error instanceof BackupError && error.code==='CONFIGURATION'){send(503,{code:'BACKUP_NOT_CONFIGURED',error:BACKUP_UNAVAILABLE});return;}
      // Never send management credentials, upstream bodies, stacks or restore plans.
      send(503,{code:'BACKUP_FAILED',error:'Não foi possível concluir a consulta ou criação do ponto seguro. Confira os pontos salvos antes de tentar criar novamente.'});
    }
  };
}
