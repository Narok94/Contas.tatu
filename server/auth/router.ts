import type { IncomingMessage, ServerResponse } from 'node:http';
import { authHandler } from './api.js';
import { createAuthService } from './service.js';

export function authMutationHandler(auth = createAuthService()) {
  const login = authHandler('login', auth);
  const logout = authHandler('logout', auth);
  return async (request: IncomingMessage & { body?: unknown }, response: ServerResponse) => {
    // Route using the actual URL, never a caller-supplied ?action= parameter.
    const path = (request.url ?? '').split('?')[0];
    if (path === '/api/auth/login' || path === '/api/auth/login/') return login(request, response);
    if (path === '/api/auth/logout' || path === '/api/auth/logout/') return logout(request, response);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.statusCode = 404;
    response.end(JSON.stringify({ error: 'Rota não encontrada.' }));
  };
}
