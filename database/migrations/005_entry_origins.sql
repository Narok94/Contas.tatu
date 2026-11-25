BEGIN;
CREATE TABLE IF NOT EXISTS finance_v2.entry_origins (
    household_id uuid NOT NULL REFERENCES finance_v2.households(id) ON DELETE RESTRICT,
    entry_type text NOT NULL CHECK (entry_type IN ('simple', 'recurring', 'installment', 'credit_card', 'simple_expense')),
    entry_id uuid NOT NULL,
    actor_user_id uuid NOT NULL,
    actor_name text NOT NULL,
    created_at timestamptz NOT NULL,
    PRIMARY KEY (household_id, entry_type, entry_id),
    FOREIGN KEY (household_id, actor_user_id) REFERENCES finance_v2.household_memberships(household_id, user_id) ON DELETE RESTRICT
);
-- Only initial installment versions have an unambiguous historical creator.
-- Never infer authors from names, amounts, payments or later edits.
INSERT INTO finance_v2.entry_origins (household_id, entry_type, entry_id, actor_user_id, actor_name, created_at)
SELECT p.household_id, 'installment', p.id, v.actor_user_id, u.display_name, p.created_at
FROM finance_v2.installment_purchases p
JOIN finance_v2.installment_versions v ON v.household_id = p.household_id AND v.purchase_id = p.id AND v.operation = 'initial'
JOIN finance_v2.household_memberships m ON m.household_id = p.household_id AND m.user_id = v.actor_user_id
JOIN finance_v2.app_users u ON u.id = m.user_id
ON CONFLICT DO NOTHING;
COMMIT;
