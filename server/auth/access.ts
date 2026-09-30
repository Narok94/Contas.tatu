import type { IncomingMessage } from 'node:http';
import { createAuthService } from './service.js';
export const production = () => !!process.env.VERCEL || process.env.NODE_ENV === 'production';
export const cookieName = () => production() ? '__Host-contas_tatu_session' : 'contas_tatu_session';
export const navigationFrom = (request: IncomingMessage) => {
  const key=request.headers['x-contas-tatu-navigation'];
  return typeof key==='string' && /^[0-9a-f]{64}$/.test(key) ? key : undefined;
};
export const tokenFrom = (request: IncomingMessage) => {
  const parts = (request.headers.cookie ?? '').split(';').map(s => s.trim()).filter(s => s.startsWith(cookieName()+'='));
  return parts.length === 1 ? parts[0].slice(cookieName().length+1) : '';
};
export function sameOrigin(request: IncomingMessage, mutation = false) {
  const site = request.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') return false;
  if (!mutation) return true;
  let expected = process.env.CONTAS_TATU_APP_ORIGIN;
  if (!production()) {
    if (!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(request.socket?.remoteAddress ?? '') ||
        !/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(request.headers.host ?? '')) return false;
    expected = `http://${request.headers.host}`;
  }
  return !!expected && request.headers.origin === expected;
}
export async function authenticated(request: IncomingMessage, auth = createAuthService()) {
  if (!sameOrigin(request, !['GET','HEAD'].includes(request.method ?? ''))) return undefined;
  return (await auth.session(tokenFrom(request),false,navigationFrom(request)))?.user;
}
export function sessionCookie(token: string, age?: number) {
  return `${cookieName()}=${token}; Path=/; HttpOnly; SameSite=Strict${production() ? '; Secure' : ''}${age === undefined ? '' : `; Max-Age=${age}`}`;
}
