import { env } from 'node:process';

// Server-only, lazy configuration. Importing this module reads no secrets.
// A future Neon client belongs here; no driver or connection exists yet.
export function readNeonConfiguration(): { connectionString: string } {
  const connectionString = env.NEON_READONLY_DATABASE_URL || env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('Server database configuration is missing');
  }
  return { connectionString };
}
