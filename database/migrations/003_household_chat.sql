-- Additive chat history; existing financial tables and rules are unchanged.
BEGIN;
CREATE TABLE finance_v2.chat_messages (
    id uuid PRIMARY KEY,
    sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
    household_id uuid NOT NULL REFERENCES finance_v2.households(id) ON DELETE RESTRICT,
    request_id uuid NOT NULL,
    role text NOT NULL CHECK (role IN ('user', 'assistant')),
    author_user_id uuid REFERENCES finance_v2.app_users(id) ON DELETE RESTRICT,
    actor_user_id uuid NOT NULL REFERENCES finance_v2.app_users(id) ON DELETE RESTRICT,
    author_name text NOT NULL CHECK (btrim(author_name) <> ''),
    actor_name text NOT NULL CHECK (btrim(actor_name) <> ''),
    content text NOT NULL CHECK (length(content) BETWEEN 1 AND 2000),
    preview jsonb,
    confirmed_preview jsonb,
    saved boolean NOT NULL DEFAULT false,
    financial_operation_id uuid,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (household_id, request_id, role),
    CHECK ((role = 'user' AND author_user_id IS NOT NULL AND author_user_id = actor_user_id) OR (role = 'assistant' AND author_user_id IS NULL)),
    CHECK (NOT saved OR (role = 'assistant' AND preview IS NOT NULL AND financial_operation_id IS NOT NULL))
);
CREATE INDEX chat_messages_household_sequence ON finance_v2.chat_messages(household_id, sequence DESC);
COMMIT;
