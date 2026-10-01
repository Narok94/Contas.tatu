import type { IncomingMessage, ServerResponse } from 'node:http';
import { authenticated } from '../auth/access.js';
import { createAuthService } from '../auth/service.js';
import { readBody } from '../category-api.js';
import { FoundationError } from '../foundation.js';
import { createChatService } from './service.js';

export function chatHandler(confirm=false, service=createChatService(), auth=createAuthService()) {
  return async (request: IncomingMessage & {body?: unknown; query?: Record<string,string|string[]>}, response: ServerResponse) => {
    response.setHeader('Content-Type','application/json; charset=utf-8');
    response.setHeader('Cache-Control','no-store');
    response.setHeader('X-Content-Type-Options','nosniff');
    const send=(status:number,body:unknown)=>{ response.statusCode=status; response.end(request.method==='HEAD' ? undefined : JSON.stringify(body)); };
    const allowed=confirm ? ['POST'] : ['GET','HEAD','POST'];
    if (!allowed.includes(request.method ?? '')) { response.setHeader('Allow',allowed.join(', ')); send(405,{error:'Método não permitido.'}); return; }
    try {
      const user=await authenticated(request,auth);
      if (!user) { send(401,{error:'Entre para continuar.'}); return; }
      if (request.method==='POST' && Object.keys(request.query ?? {}).length) throw new FoundationError(400,'Invalid query');
      send(200,request.method==='POST' ? await (confirm ? service.confirm(user,await readBody(request)) : service.send(user,await readBody(request))) : await service.list(user,request.query));
    } catch (error) {
      if (error instanceof FoundationError) send(error.status,{error:error.message});
      else send(503,{error:'Não foi possível carregar ou salvar a conversa. Tente novamente.'});
    }
  };
}
