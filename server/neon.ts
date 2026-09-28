import { env } from 'node:process';
import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

let cachedClient: NeonQueryFunction<false, false> | undefined;
let cachedConnectionString: string | undefined;

// Server-only. Import and client creation perform no database requests.
// The Node runtime supplies environment variables; this module never reads env files.
export function getNeonClient(): NeonQueryFunction<false, false> {
  const connectionString = env.CONTAS_TATU_DATABASE_URL;
  if (!connectionString?.trim()) {
    throw new Error('CONTAS_TATU_DATABASE_URL must be configured on the server');
  }

  if (cachedClient && cachedConnectionString === connectionString) {
    return cachedClient;
  }

  try {
    const url = new URL(connectionString);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
      throw new Error();
    }
    const client = neon(connectionString);
    cachedClient = client;
    cachedConnectionString = connectionString;
    return client;
  } catch {
    // Driver/URL errors may contain credentials. Never propagate their message or cause.
    throw new Error('CONTAS_TATU_DATABASE_URL must be a valid PostgreSQL connection URL');
  }
}
