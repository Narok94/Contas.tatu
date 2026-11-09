BEGIN;
CREATE TABLE IF NOT EXISTS finance_v2.mobile_payments (
    household_id uuid NOT NULL REFERENCES finance_v2.households(id) ON DELETE RESTRICT,
    id uuid NOT NULL,
    actor_user_id uuid NOT NULL REFERENCES finance_v2.app_users(id) ON DELETE RESTRICT,
    account_id uuid NOT NULL,
    account_type text NOT NULL CHECK (account_type IN ('simple', 'recurring', 'installment', 'credit_card')),
    month finance_v2.month_key NOT NULL,
    name text NOT NULL,
    category_name text,
    location text,
    paid_amount numeric(17,2) NOT NULL CHECK (paid_amount > 0),
    remaining_amount numeric(17,2) NOT NULL CHECK (remaining_amount >= 0),
    target_month finance_v2.month_key,
    target_id uuid,
    target_type text CHECK (target_type IN ('simple', 'recurring', 'installment', 'credit_card')),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (household_id, id),
    CHECK ((target_month IS NULL AND target_id IS NULL AND target_type IS NULL) OR
           (remaining_amount > 0 AND target_month IS NOT NULL AND
            target_month = (month + interval '1 month')::date AND target_id IS NOT NULL AND target_type IS NOT NULL))
);
COMMIT;
