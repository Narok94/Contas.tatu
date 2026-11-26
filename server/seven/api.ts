import type { IncomingMessage, ServerResponse } from 'node:http';
import { authenticated } from '../auth/access.js';
import { createAuthService } from '../auth/service.js';
import { FoundationError } from '../foundation.js';
import { readBody } from '../category-api.js';
import { createSevenService } from './service.js';
import { canAccessSeven } from '../../src/seven/model.js';
export function sevenHandler(service=createSevenService(),auth=createAuthService()) {
  return async (request: IncomingMessage & {body?:unknown;query?:Record<string,string|string[]>}, response: ServerResponse) => {
    response.setHeader('Cache-Control','no-store');
    response.setHeader('Content-Type','application/json; charset=utf-8');
    response.setHeader('X-Content-Type-Options','nosniff');
    const send=(status:number,body:unknown)=>{response.statusCode=status;response.end(JSON.stringify(body));};
    if (!['GET','POST','DELETE'].includes(request.method ?? '')) { response.setHeader('Allow','GET, POST, DELETE');send(405,{error:'Método não permitido.'});return; }
    try {
      const user=await authenticated(request,auth);
      if (!user) {send(401,{error:'Entre para continuar.'});return;}
      if (!canAccessSeven(user)) {send(403,{error:'Área exclusiva do Henrique.'});return;}
      if (request.method==='GET') send(200,await service.read(user,request.query));
      else {
        if (Object.keys(request.query ?? {}).length) throw new FoundationError(400,'Consulta inválida.');
        const body=await readBody(request, 3300000);
        send(200,await (request.method==='POST' ? service.save(user,body) : service.remove(user,body)));
      }
    } catch(error) {
      send(error instanceof FoundationError ? error.status : 503,{error:error instanceof FoundationError ? error.message : 'Não foi possível acessar os comprovantes. Tente novamente.'});
    }
  };
}
