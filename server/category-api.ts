import type { IncomingMessage, ServerResponse } from 'node:http';
import { createFoundation, FoundationError } from './foundation.js';

type Request = IncomingMessage & { body?: unknown; query?: Record<string, string | string[]> };
type Foundation = ReturnType<typeof createFoundation>;

// Temporary local-only boundary, NOT authentication. Never trust forwarded headers.
export function localAccess(request: Request) {
  return !process.env.VERCEL && process.env.NODE_ENV !== 'production' &&
    process.env.CONTAS_TATU_ENABLE_LOCAL_API === 'true' &&
    ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket?.remoteAddress ?? '') &&
    (!request.headers.origin || request.headers.origin === `http://${request.headers.host}`) &&
    !request.headers['x-forwarded-for'] && !request.headers.forwarded &&
    (!request.headers['sec-fetch-site'] || request.headers['sec-fetch-site'] === 'same-origin' || request.headers['sec-fetch-site'] === 'none') &&
    /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(request.headers.host ?? '');
}
export async function readBody(request: Request) {
  const contentType = request.headers['content-type']?.split(';')[0].trim().toLowerCase();
  if (contentType !== 'application/json') throw new FoundationError(415, 'JSON body required');
  let body = request.body;
  if (body === undefined) {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > 8192) throw new FoundationError(413, 'Request too large');
      chunks.push(buffer);
    }
    body = Buffer.concat(chunks).toString('utf8');
  }
  if (Buffer.byteLength(typeof body === 'string' ? body : JSON.stringify(body)) > 8192) throw new FoundationError(413, 'Request too large');
  if (typeof body === 'string') {
    try { return JSON.parse(body); } catch { throw new FoundationError(400, 'Invalid JSON'); }
  }
  return body;
}

export function categoryHandler(item: boolean, service: Foundation = createFoundation()) {
  return async (request: Request, response: ServerResponse) => {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status: number, body: unknown) => {
      response.statusCode = status;
      response.end(request.method === 'HEAD' ? undefined : JSON.stringify(body));
    };
    const methods = item ? ['PATCH', 'DELETE'] : ['GET', 'POST'];
    if (!methods.includes(request.method ?? '')) {
      response.setHeader('Allow', methods.join(', '));
      send(405, { error: 'Method not allowed' }); return;
    }
    if (!localAccess(request)) { send(403, { error: 'Controlled local access only' }); return; }
    try {
      // No household selector is accepted, even as an ignored query parameter.
      if (Object.keys(request.query ?? {}).some(k => k !== 'id' || !item)) throw new FoundationError(400, 'Invalid query');
      if (!item) {
        if (request.method === 'GET') send(200, { categories: await service.listCategories() });
        else send(201, { category: await service.createCategory(await readBody(request)) });
      } else {
        const id = request.query?.id;
        if (typeof id !== 'string') throw new FoundationError(400, 'Invalid category ID');
        if (request.method === 'PATCH') send(200, { category: await service.editCategory(id, await readBody(request)) });
        else send(200, await service.archiveCategory(id));
      }
    } catch (error) {
      if (error instanceof FoundationError) send(error.status, { error: error.message });
      else send(500, { error: 'Unable to process category request' });
    }
  };
}
