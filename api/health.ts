import type { IncomingMessage, ServerResponse } from 'node:http';

// Native Node handler supported by Vercel; no database or environment access.
export default function health(request: IncomingMessage, response: ServerResponse) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('X-Content-Type-Options', 'nosniff');

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    response.statusCode = 405;
    response.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  response.statusCode = 200;
  response.end(request.method === 'HEAD' ? undefined : JSON.stringify({ status: 'ok' }));
}
