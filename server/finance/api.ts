import type { IncomingMessage, ServerResponse } from 'node:http';
import { localAccess, readBody } from '../category-api.js';
import { FoundationError } from '../foundation.js';
import { createFinanceService } from './service.js';

type Request = IncomingMessage & { body?: unknown; query?: Record<string, string | string[]> };
export function financeHandler(commands: boolean, service = createFinanceService()) {
  return async (request: Request, response: ServerResponse) => {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status: number, body: unknown) => { response.statusCode = status; response.end(request.method === 'HEAD' ? undefined : JSON.stringify(body)); };
    const allowed = commands ? ['POST'] : ['GET', 'HEAD'];
    if (!allowed.includes(request.method ?? '')) { response.setHeader('Allow', allowed.join(', ')); send(405, { error: 'Method not allowed' }); return; }
    if (!localAccess(request)) { send(403, { error: 'Controlled local access only' }); return; }
    try {
      const query = request.query ?? {};
      if (Object.keys(query).some(k => commands || !['month', 'payoffId'].includes(k))) throw new FoundationError(400, 'Invalid query');
      const result = commands ? await service.execute(await readBody(request)) :
        query.payoffId ? await service.payoffQuote(query.payoffId, query.month) : await service.read(query.month);
      send(200, result);
    } catch (error) {
      if (error instanceof FoundationError) send(error.status, { error: error.message });
      else send(500, { error: 'Unable to process financial request' });
    }
  };
}
