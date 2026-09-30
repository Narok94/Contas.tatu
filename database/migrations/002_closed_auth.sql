-- Closed household authentication. No changes to existing financial tables or neon_auth.
BEGIN;
CREATE TABLE finance_v2.auth_credentials (
    user_id uuid PRIMARY KEY REFERENCES finance_v2.app_users(id) ON DELETE RESTRICT,
    login text NOT NULL UNIQUE CHECK (login IN ('henrique','jessica')),
    password_hash text NOT NULL CHECK (password_hash ~ '^\$2[aby]\$12\$'),
    password_version integer NOT NULL DEFAULT 1 CHECK (password_version >= 1),
    enabled boolean NOT NULL DEFAULT true,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE finance_v2.auth_sessions (
    token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    user_id uuid NOT NULL REFERENCES finance_v2.auth_credentials(user_id) ON DELETE CASCADE,
    password_version integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    renewed_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at timestamptz NOT NULL,
    absolute_expires_at timestamptz NOT NULL,
    persistent boolean NOT NULL DEFAULT false,
    CHECK (created_at < expires_at AND expires_at <= absolute_expires_at)
);
CREATE INDEX auth_sessions_user_idx ON finance_v2.auth_sessions(user_id);
CREATE INDEX auth_sessions_expiry_idx ON finance_v2.auth_sessions(expires_at);
-- Database-backed limits survive serverless instance restarts. Keys contain hashes, not IPs/logins.
CREATE TABLE finance_v2.auth_login_limits (
    key_hash text PRIMARY KEY CHECK (key_hash ~ '^[0-9a-f]{64}$'),
    window_start timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    attempts integer NOT NULL DEFAULT 1 CHECK (attempts >= 1)
);
COMMIT;
