-- Independent work-expense register. Never writes financial entries or revisions.
CREATE TABLE IF NOT EXISTS finance_v2.seven_expenses (
  id uuid PRIMARY KEY,
  household_id uuid NOT NULL REFERENCES finance_v2.households(id),
  owner_id uuid NOT NULL REFERENCES finance_v2.app_users(id)
    CHECK (owner_id = 'ad72e2a0-2643-4c2b-9c31-e15d77103103'),
  description text NOT NULL CHECK (length(description) BETWEEN 1 AND 200),
  location text NOT NULL CHECK (length(location) BETWEEN 1 AND 200),
  expense_date date NOT NULL,
  cents integer NOT NULL CHECK (cents > 0),
  notes text NOT NULL DEFAULT '',
  account_id uuid,
  images jsonb NOT NULL CHECK (jsonb_typeof(images) = 'array' AND jsonb_array_length(images) BETWEEN 1 AND 10),
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (household_id, account_id) REFERENCES finance_v2.simple_accounts(household_id,id) ON DELETE RESTRICT,
  UNIQUE (owner_id, account_id),
  UNIQUE (owner_id, expense_date, description, location, cents)
);
CREATE INDEX IF NOT EXISTS seven_expenses_month_idx ON finance_v2.seven_expenses(owner_id,expense_date);
