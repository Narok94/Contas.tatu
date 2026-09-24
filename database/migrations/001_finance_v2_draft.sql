-- DRAFT ONLY
-- DO NOT EXECUTE WITHOUT REVIEW
-- Stage 2: static/manual review only. No database, migration runner or API integration.
-- All application objects belong exclusively to finance_v2.
-- UUIDs are assigned by the future server/importer; no extension or generator required.
-- Not idempotent DDL: an existing schema must cause an error, not be silently reused.
-- No roles, grants, seeds or financial command implementations are included.
-- Future service must enforce authorization, household locking, closed-month guards,
-- lifecycle transitions, decimal input validation and snapshot payload semantics.
-- This file is NOT sufficient to expose a financial API.
-- Money/status/month domains allow NULL; requiredness is declared on each column.

CREATE SCHEMA finance_v2;

CREATE DOMAIN finance_v2.month_key AS date
    CONSTRAINT month_key_valid CHECK (
        VALUE BETWEEN DATE '0001-01-01' AND DATE '9999-12-01'
        AND EXTRACT(DAY FROM VALUE) = 1
    );

CREATE DOMAIN finance_v2.money_amount AS numeric(15,2)
    CONSTRAINT money_amount_valid CHECK (
        VALUE BETWEEN 0 AND 9999999999999.99
        AND VALUE <> 'NaN'::numeric
    );

CREATE DOMAIN finance_v2.signed_money_amount AS numeric(15,2)
    CONSTRAINT signed_money_amount_valid CHECK (
        VALUE BETWEEN -9999999999999.99 AND 9999999999999.99
        AND VALUE <> 'NaN'::numeric
    );

-- Text + CHECK instead of enum; supports future constraint migration.
-- Legacy non-card partial states are preserved; new partial commands are card-only.
CREATE DOMAIN finance_v2.payment_status AS text
    CONSTRAINT payment_status_valid CHECK (VALUE IN ('pendente', 'parcial', 'pago'));

-- Financial ownership boundary; lock this row before every future financial command.
CREATE TABLE finance_v2.households (
    id uuid NOT NULL,
    name text NOT NULL,
    revision bigint NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CHECK (btrim(name) <> ''),
    CHECK (revision >= 0)
);

-- Provider-neutral identity, not an authentication implementation.
CREATE TABLE finance_v2.app_users (
    id uuid NOT NULL,
    auth_issuer text NOT NULL,
    auth_subject text NOT NULL,
    display_name text,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE (auth_issuer, auth_subject),
    CHECK (btrim(auth_issuer) <> ''),
    CHECK (btrim(auth_subject) <> '')
);

-- Access membership; role enforcement and last-owner rule belong to the future service.
CREATE TABLE finance_v2.household_memberships (
    household_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (household_id, user_id),
    FOREIGN KEY (household_id) REFERENCES finance_v2.households (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (user_id) REFERENCES finance_v2.app_users (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CHECK (role IN ('owner', 'editor', 'viewer'))
);

-- Immutable successful import receipt; hashes and original payload do not constitute a second live store.
CREATE TABLE finance_v2.import_batches (
    household_id uuid NOT NULL,
    id uuid NOT NULL,
    source_key text NOT NULL DEFAULT 'organizacao_financeira_store_v1',
    source_sha256 text NOT NULL,
    canonical_sha256 text NOT NULL,
    source_payload jsonb NOT NULL,
    source_classification text NOT NULL,
    classification_evidence jsonb NOT NULL,
    imported_by uuid,
    imported_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    importer_version text NOT NULL,
    PRIMARY KEY (household_id, id),
    FOREIGN KEY (household_id) REFERENCES finance_v2.households (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (imported_by) REFERENCES finance_v2.app_users (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    UNIQUE (household_id, source_sha256),
    UNIQUE (household_id, canonical_sha256),
    CHECK (source_key = 'organizacao_financeira_store_v1'),
    CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
    CHECK (canonical_sha256 ~ '^[0-9a-f]{64}$'),
    CHECK (jsonb_typeof(source_payload) = 'object'),
    CHECK (jsonb_typeof(classification_evidence) = 'object'),
    CHECK (source_classification IN ('empty', 'demo_match', 'user_confirmed', 'modified_demo', 'unknown')),
    CHECK (btrim(importer_version) <> '')
);

-- Optional classification. Archive and explicitly unlink live references; never cascade to history.
CREATE TABLE finance_v2.categories (
    household_id uuid NOT NULL,
    id uuid NOT NULL,
    source_import_id uuid,
    legacy_id text,
    sort_order bigint NOT NULL,
    archived_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    name text NOT NULL,
    color text NOT NULL,
    description text,
    PRIMARY KEY (household_id, id),
    FOREIGN KEY (household_id) REFERENCES finance_v2.households (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (household_id, source_import_id) REFERENCES finance_v2.import_batches (household_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    UNIQUE (household_id, source_import_id, legacy_id),
    CHECK ((source_import_id IS NULL) = (legacy_id IS NULL)),
    CHECK (legacy_id IS NULL OR btrim(legacy_id) <> ''),
    CHECK (btrim(name) <> '')
);

-- Monthly invoice aggregator; no stored carryover or billing due date.
CREATE TABLE finance_v2.credit_cards (
    household_id uuid NOT NULL,
    id uuid NOT NULL,
    source_import_id uuid,
    legacy_id text,
    sort_order bigint NOT NULL,
    archived_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    name text NOT NULL,
    brand text,
    color text,
    PRIMARY KEY (household_id, id),
    FOREIGN KEY (household_id) REFERENCES finance_v2.households (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (household_id, source_import_id) REFERENCES finance_v2.import_batches (household_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    UNIQUE (household_id, source_import_id, legacy_id),
    CHECK ((source_import_id IS NULL) = (legacy_id IS NULL)),
    CHECK (legacy_id IS NULL OR btrim(legacy_id) <> ''),
    CHECK (btrim(name) <> '')
);

-- Single-month occurrence; amount itself is the paid value when status is pago.
CREATE TABLE finance_v2.simple_accounts (
    household_id uuid NOT NULL,
    id uuid NOT NULL,
    source_import_id uuid,
    legacy_id text,
    sort_order bigint NOT NULL,
    archived_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    name text NOT NULL,
    amount finance_v2.money_amount NOT NULL,
    month finance_v2.month_key NOT NULL,
    category_id uuid,
    status finance_v2.payment_status NOT NULL DEFAULT 'pendente',
    notes text,
    PRIMARY KEY (household_id, id),
    FOREIGN KEY (household_id) REFERENCES finance_v2.households (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (household_id, source_import_id) REFERENCES finance_v2.import_batches (household_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    UNIQUE (household_id, source_import_id, legacy_id),
    CHECK ((source_import_id IS NULL) = (legacy_id IS NULL)),
    CHECK (legacy_id IS NULL OR btrim(legacy_id) <> ''),
    FOREIGN KEY (household_id, category_id) REFERENCES finance_v2.categories (household_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CHECK (btrim(name) <> '')
);

-- Recurring identity. No monthly default amount: a missing occurrence starts at zero.
CREATE TABLE finance_v2.recurring_definitions (
    household_id uuid NOT NULL,
    id uuid NOT NULL,
    source_import_id uuid,
    legacy_id text,
    sort_order bigint NOT NULL,
    archived_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    name text NOT NULL,
    category_id uuid,
    start_month finance_v2.month_key NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    notes text,
    PRIMARY KEY (household_id, id),
    FOREIGN KEY (household_id) REFERENCES finance_v2.households (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (household_id, source_import_id) REFERENCES finance_v2.import_batches (household_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    UNIQUE (household_id, source_import_id, legacy_id),
    CHECK ((source_import_id IS NULL) = (legacy_id IS NULL)),
    CHECK (legacy_id IS NULL OR btrim(legacy_id) <> ''),
    FOREIGN KEY (household_id, category_id) REFERENCES finance_v2.categories (household_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CHECK (btrim(name) <> '')
);

-- Independent occurrence; zero explicitly informed differs from unset.
CREATE TABLE finance_v2.recurring_monthly_records (
    household_id uuid NOT NULL,
    id uuid NOT NULL,
    source_import_id uuid,
    legacy_id text,
    sort_order bigint NOT NULL,
    archived_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    definition_id uuid NOT NULL,
    month finance_v2.month_key NOT NULL,
    amount finance_v2.money_amount NOT NULL DEFAULT 0,
    is_value_set boolean NOT NULL DEFAULT false,
    status finance_v2.payment_status NOT NULL DEFAULT 'pendente',
    notes text,
    PRIMARY KEY (household_id, id),
    FOREIGN KEY (household_id) REFERENCES finance_v2.households (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (household_id, source_import_id) REFERENCES finance_v2.import_batches (household_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    UNIQUE (household_id, source_import_id, legacy_id),
    CHECK ((source_import_id IS NULL) = (legacy_id IS NULL)),
    CHECK (legacy_id IS NULL OR btrim(legacy_id) <> ''),
    FOREIGN KEY (household_id, definition_id) REFERENCES finance_v2.recurring_definitions (household_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    UNIQUE (household_id, definition_id, month),
    CHECK (is_value_set OR (amount = 0 AND status = 'pendente'))
);

-- Stable purchase identity only. All schedule and ownership facts live in immutable versions.
CREATE TABLE finance_v2.installment_purchases (
    household_id uuid NOT NULL,
    id uuid NOT NULL,
    source_import_id uuid,
    legacy_id text,
    sort_order bigint NOT NULL,
    archived_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    start_month finance_v2.month_key NOT NULL,
    notes text,
    PRIMARY KEY (household_id, id),
    FOREIGN KEY (household_id) REFERENCES finance_v2.households (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (household_id, source_import_id) REFERENCES finance_v2.import_batches (household_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    UNIQUE (household_id, source_import_id, legacy_id),
    CHECK ((source_import_id IS NULL) = (legacy_id IS NULL)),
    CHECK (legacy_id IS NULL OR btrim(legacy_id) <> '')
);

-- Append-only boundaries and one-month corrections. No overlapping stored intervals.
-- Resolve correction for the exact month first; otherwise latest (effective_from_month, revision).
-- Forward periods end at the next distinct boundary. Revision totally orders same-month decisions.
CREATE TABLE finance_v2.installment_versions (
    household_id uuid NOT NULL,
    purchase_id uuid NOT NULL,
    revision integer NOT NULL,
    operation text NOT NULL,
    effective_from_month finance_v2.month_key NOT NULL,
    description text NOT NULL,
    total_amount finance_v2.money_amount NOT NULL,
    installments_count integer NOT NULL,
    base_installment_number integer NOT NULL,
    credit_card_id uuid,
    category_id uuid,
    rounding_rule text NOT NULL,
    payoff_amount finance_v2.money_amount,
    reason text NOT NULL,
    occurred_at timestamptz,
    recorded_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actor_user_id uuid,
    PRIMARY KEY (household_id, purchase_id, revision),
    FOREIGN KEY (household_id) REFERENCES finance_v2.households (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (household_id, purchase_id) REFERENCES finance_v2.installment_purchases (household_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (household_id, credit_card_id) REFERENCES finance_v2.credit_cards (household_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (household_id, category_id) REFERENCES finance_v2.categories (household_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (actor_user_id) REFERENCES finance_v2.app_users (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CHECK (revision >= 1),
    CHECK (operation IN ('initial', 'change', 'correction', 'cancel', 'payoff')),
    CHECK ((operation = 'initial') = (revision = 1)),
    CHECK (btrim(description) <> ''),
    CHECK (btrim(reason) <> ''),
    CHECK (installments_count >= 1),
    CHECK (base_installment_number BETWEEN 1 AND installments_count),
    CHECK ((EXTRACT(YEAR FROM effective_from_month) - 1) * 12
        + EXTRACT(MONTH FROM effective_from_month) - 1
        + installments_count - base_installment_number <= 119987),
    CHECK (rounding_rule = 'legacy_uniform'),
    CHECK ((operation = 'payoff') = (payoff_amount IS NOT NULL)),
    CHECK (operation = 'initial' OR occurred_at IS NOT NULL)
);

-- Union of statusByMonth and paymentAmountsByMonth; override survives payment reversal.
CREATE TABLE finance_v2.installment_month_states (
    household_id uuid NOT NULL,
    purchase_id uuid NOT NULL,
    month finance_v2.month_key NOT NULL,
    status finance_v2.payment_status,
    amount_override finance_v2.money_amount,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (household_id, purchase_id, month),
    FOREIGN KEY (household_id) REFERENCES finance_v2.households (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (household_id, purchase_id) REFERENCES finance_v2.installment_purchases (household_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CHECK (status IS NOT NULL OR amount_override IS NOT NULL)
);

-- Immutable historical occurrence. Snapshot reference strings are descriptive, not live FKs.
CREATE TABLE finance_v2.installment_month_snapshots (
    household_id uuid NOT NULL,
    purchase_id uuid NOT NULL,
    month finance_v2.month_key NOT NULL,
    current_installment integer NOT NULL,
    total_installments integer NOT NULL,
    remaining_installments integer NOT NULL,
    installment_amount finance_v2.money_amount NOT NULL,
    end_month finance_v2.month_key NOT NULL,
    description text,
    category_id_snapshot text,
    total_amount finance_v2.money_amount,
    card_id_snapshot text,
    card_assignment_known boolean NOT NULL DEFAULT false,
    category_assignment_known boolean NOT NULL DEFAULT false,
    schema_version integer NOT NULL,
    captured_at timestamptz,
    recorded_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (household_id, purchase_id, month),
    FOREIGN KEY (household_id) REFERENCES finance_v2.households (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (household_id, purchase_id) REFERENCES finance_v2.installment_purchases (household_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CHECK (total_installments >= 1),
    CHECK (current_installment BETWEEN 1 AND total_installments),
    CHECK (remaining_installments = total_installments - current_installment),
    CHECK (end_month >= month),
    CHECK (
        (EXTRACT(YEAR FROM end_month) - EXTRACT(YEAR FROM month)) * 12
        + EXTRACT(MONTH FROM end_month) - EXTRACT(MONTH FROM month)
        = remaining_installments
    ),
    CHECK (schema_version IN (1, 2)),
    CHECK (card_assignment_known OR card_id_snapshot IS NULL),
    CHECK (schema_version = 1 OR (description IS NOT NULL AND btrim(description) <> '' AND total_amount IS NOT NULL AND card_assignment_known AND category_assignment_known AND captured_at IS NOT NULL))
);

-- Invoice component only; no independent payment or carryover rows.
CREATE TABLE finance_v2.card_expenses (
    household_id uuid NOT NULL,
    id uuid NOT NULL,
    source_import_id uuid,
    legacy_id text,
    sort_order bigint NOT NULL,
    archived_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    card_id uuid NOT NULL,
    description text NOT NULL,
    amount finance_v2.money_amount NOT NULL,
    month finance_v2.month_key NOT NULL,
    category_id uuid,
    PRIMARY KEY (household_id, id),
    FOREIGN KEY (household_id) REFERENCES finance_v2.households (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (household_id, source_import_id) REFERENCES finance_v2.import_batches (household_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    UNIQUE (household_id, source_import_id, legacy_id),
    CHECK ((source_import_id IS NULL) = (legacy_id IS NULL)),
    CHECK (legacy_id IS NULL OR btrim(legacy_id) <> ''),
    FOREIGN KEY (household_id, card_id) REFERENCES finance_v2.credit_cards (household_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (household_id, category_id) REFERENCES finance_v2.categories (household_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CHECK (btrim(description) <> '')
);

-- paid_amount is a replacement accumulated total. NULL preserves legacy inference; adjustment stays inert.
CREATE TABLE finance_v2.card_monthly_invoices (
    household_id uuid NOT NULL,
    id uuid NOT NULL,
    source_import_id uuid,
    legacy_id text,
    sort_order bigint NOT NULL,
    archived_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    card_id uuid NOT NULL,
    month finance_v2.month_key NOT NULL,
    recorded_status finance_v2.payment_status NOT NULL DEFAULT 'pendente',
    paid_amount finance_v2.money_amount,
    manual_adjustment finance_v2.signed_money_amount,
    paid_at timestamptz,
    PRIMARY KEY (household_id, id),
    FOREIGN KEY (household_id) REFERENCES finance_v2.households (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (household_id, source_import_id) REFERENCES finance_v2.import_batches (household_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    UNIQUE (household_id, source_import_id, legacy_id),
    CHECK ((source_import_id IS NULL) = (legacy_id IS NULL)),
    CHECK (legacy_id IS NULL OR btrim(legacy_id) <> ''),
    FOREIGN KEY (household_id, card_id) REFERENCES finance_v2.credit_cards (household_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    UNIQUE (household_id, card_id, month),
    CHECK (paid_amount IS NULL OR recorded_status <> 'pendente' OR paid_amount = 0),
    CHECK (paid_amount IS NULL OR recorded_status <> 'parcial' OR paid_amount > 0),
    -- Unknown legacy payment is preserved; explicit zero cannot carry a payment time.
    CHECK (paid_amount IS NULL OR paid_amount > 0 OR paid_at IS NULL)
);

-- NULL current_closure_id means open. Closure pointer FK is added after both tables exist.
CREATE TABLE finance_v2.financial_months (
    household_id uuid NOT NULL,
    month finance_v2.month_key NOT NULL,
    current_closure_id uuid,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (household_id, month),
    FOREIGN KEY (household_id) REFERENCES finance_v2.households (id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

-- Immutable full payload. Official state is the pointer, not MAX(revision) or latest timestamp.
CREATE TABLE finance_v2.month_closures (
    household_id uuid NOT NULL,
    id uuid NOT NULL,
    month finance_v2.month_key NOT NULL,
    revision integer NOT NULL,
    closed_at timestamptz,
    schema_version integer NOT NULL,
    rules_version text NOT NULL,
    payload jsonb NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    source_import_id uuid,
    actor_user_id uuid,
    PRIMARY KEY (household_id, month, id),
    FOREIGN KEY (household_id) REFERENCES finance_v2.households (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (household_id, month) REFERENCES finance_v2.financial_months (household_id, month) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (household_id, source_import_id) REFERENCES finance_v2.import_batches (household_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (actor_user_id) REFERENCES finance_v2.app_users (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    UNIQUE (household_id, month, revision),
    CHECK (revision >= 1),
    CHECK (schema_version IN (1, 2)),
    CHECK (btrim(rules_version) <> ''),
    CHECK (source_import_id IS NOT NULL OR closed_at IS NOT NULL),
    CHECK (jsonb_typeof(payload) = 'object'),
    CHECK ((jsonb_typeof(payload -> 'accounts') = 'array') IS TRUE),
    CHECK ((jsonb_typeof(payload -> 'summary') = 'object') IS TRUE),
    CHECK ((jsonb_typeof(payload -> 'closedAt') = 'string') IS TRUE),
    CHECK ((payload ->> 'month' = to_char(month, 'YYYY-MM')) IS TRUE),
    CHECK ((payload -> 'summary' ->> 'month' = to_char(month, 'YYYY-MM')) IS TRUE)
);

-- Append-only archival event; reopening time is unknown in localStorage history.
CREATE TABLE finance_v2.month_reopenings (
    household_id uuid NOT NULL,
    month finance_v2.month_key NOT NULL,
    closure_id uuid NOT NULL,
    reopened_at timestamptz,
    recorded_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    source text NOT NULL,
    actor_user_id uuid,
    PRIMARY KEY (household_id, month, closure_id),
    FOREIGN KEY (household_id) REFERENCES finance_v2.households (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (household_id, month, closure_id) REFERENCES finance_v2.month_closures (household_id, month, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (actor_user_id) REFERENCES finance_v2.app_users (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CHECK (source IN ('command', 'legacy_import')),
    CHECK (source = 'legacy_import' OR reopened_at IS NOT NULL)
);

-- Same household AND same month; MATCH SIMPLE permits an open month with NULL pointer.
ALTER TABLE finance_v2.financial_months
    ADD CONSTRAINT financial_months_current_closure_fk
    FOREIGN KEY (household_id, month, current_closure_id)
    REFERENCES finance_v2.month_closures (household_id, month, id)
    MATCH SIMPLE ON UPDATE RESTRICT ON DELETE RESTRICT;

-- Extra indexes only; PK/UNIQUE already cover other primary access paths.
CREATE INDEX simple_accounts_month_idx ON finance_v2.simple_accounts (household_id, month);
CREATE INDEX recurring_records_month_idx ON finance_v2.recurring_monthly_records (household_id, month);
CREATE INDEX card_expenses_card_month_idx ON finance_v2.card_expenses (household_id, card_id, month);
CREATE INDEX card_invoices_month_idx ON finance_v2.card_monthly_invoices (household_id, month);
CREATE INDEX installment_versions_month_idx ON finance_v2.installment_versions (household_id, purchase_id, effective_from_month, revision);
CREATE INDEX installment_versions_card_idx ON finance_v2.installment_versions (household_id, credit_card_id, effective_from_month);
CREATE INDEX memberships_user_idx ON finance_v2.household_memberships (user_id, household_id);

-- Draft integrity protection only, not financial transaction/business logic.
-- Statement triggers also reject TRUNCATE. No SECURITY DEFINER privileges.
CREATE FUNCTION finance_v2.reject_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $finance_v2_history$
BEGIN
    RAISE EXCEPTION 'finance_v2 immutable history: %.% rejects %',
        TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP
        USING ERRCODE = '55000';
END;
$finance_v2_history$;

CREATE TRIGGER installment_versions_immutable
    BEFORE UPDATE OR DELETE OR TRUNCATE ON finance_v2.installment_versions
    FOR EACH STATEMENT EXECUTE FUNCTION finance_v2.reject_history_mutation();

CREATE TRIGGER installment_month_snapshots_immutable
    BEFORE UPDATE OR DELETE OR TRUNCATE ON finance_v2.installment_month_snapshots
    FOR EACH STATEMENT EXECUTE FUNCTION finance_v2.reject_history_mutation();

CREATE TRIGGER month_closures_immutable
    BEFORE UPDATE OR DELETE OR TRUNCATE ON finance_v2.month_closures
    FOR EACH STATEMENT EXECUTE FUNCTION finance_v2.reject_history_mutation();

CREATE TRIGGER month_reopenings_immutable
    BEFORE UPDATE OR DELETE OR TRUNCATE ON finance_v2.month_reopenings
    FOR EACH STATEMENT EXECUTE FUNCTION finance_v2.reject_history_mutation();

CREATE TRIGGER import_batches_immutable
    BEFORE UPDATE OR DELETE OR TRUNCATE ON finance_v2.import_batches
    FOR EACH STATEMENT EXECUTE FUNCTION finance_v2.reject_history_mutation();

-- Deliberately no transaction execution, GRANT, role creation or RLS policy here.
-- Permissions/RLS and service protocols require a separate reviewed stage.
-- See docs/DATABASE-DESIGN.md for migration classification, legacy ID mapping,
-- archive projection rules and the boundary between SQL checks and future commands.
