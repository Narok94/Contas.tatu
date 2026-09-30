import type { IncomingMessage, ServerResponse } from 'node:http';
import { readBody } from '../category-api.js';
import { FoundationError } from '../foundation.js';
import { createAuthService } from './service.js';
import { production, sameOrigin, sessionCookie, tokenFrom, navigationFrom } from './access.js';
export function authHandler(action: 'login'|'logout'|'session', auth = createAuthService()) {
  return async (request: IncomingMessage & { body?: unknown }, response: ServerResponse) => {
    response.setHeader('Cache-Control','no-store'); response.setHeader('Content-Type','application/json; charset=utf-8');
    response.setHeader('X-Content-Type-Options','nosniff');
    const send = (status: number, value: unknown) => { response.statusCode=status; response.end(JSON.stringify(value)); };
    const method = action === 'session' ? 'GET' : 'POST';
    if (request.method !== method) { response.setHeader('Allow',method); send(405,{error:'Método não permitido.'}); return; }
    if (!sameOrigin(request, action !== 'session')) { send(403,{error:'Acesso não permitido.'}); return; }
    try {
      const token = tokenFrom(request);
      if (action === 'login') {
        // Vercel overwrites x-real-ip; elsewhere use the direct peer, never arbitrary forwarded headers.
        const address = production() && process.env.VERCEL ? String(request.headers['x-real-ip'] ?? 'unknown') : request.socket.remoteAddress ?? 'unknown';
        const result = await auth.login(await readBody(request),address,token);
        response.setHeader('Set-Cookie',sessionCookie(result.token,result.age)); send(200,{user:result.user});
      } else if (action === 'logout') {
        await auth.logout(token,navigationFrom(request)); response.setHeader('Set-Cookie',sessionCookie('',0)); send(200,{ok:true});
      } else {
        const result = await auth.session(token,true,navigationFrom(request));
        if (!result) { response.setHeader('Set-Cookie',sessionCookie('',0)); send(401,{error:'Entre para continuar.'}); return; }
        if (result.token) response.setHeader('Set-Cookie',sessionCookie(result.token,result.age));
        send(200,{user:result.user});
      }
    } catch (error) {
      if (error instanceof FoundationError) send(error.status,{error:error.message});
      else send(503,{error:'Não foi possível conectar. Tente novamente em instantes.'});
    }
  };
}
