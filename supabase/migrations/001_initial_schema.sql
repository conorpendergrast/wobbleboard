-- Wobbleboard initial schema
-- Currency: GBP pence for all monetary values

-- Companies (employers who subscribe to Wobbleboard)
CREATE TABLE companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  industry text,
  mrr integer, -- GBP pence
  employee_count integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Contacts (people at those companies using Wobbleboard)
CREATE TABLE contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text NOT NULL UNIQUE,
  role text, -- 'hr_admin', 'wellness_champion', 'employee'
  signed_up_at timestamptz NOT NULL DEFAULT now(),
  last_active_at timestamptz
);

CREATE INDEX idx_contacts_company_id ON contacts(company_id);

-- Subscriptions (one per company)
CREATE TABLE subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  plan_tier text NOT NULL, -- 'starter', 'growth', 'enterprise'
  status text NOT NULL, -- 'active', 'churned', 'trial', 'past_due'
  billing_cycle text, -- 'monthly', 'annual'
  renewal_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscriptions_company_id ON subscriptions(company_id);

-- Product events (user activity within Wobbleboard)
CREATE TABLE product_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  event_name text NOT NULL, -- e.g. 'challenge_created', 'report_exported'
  metadata jsonb NOT NULL DEFAULT '{}',
  timestamp timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_product_events_contact_id ON product_events(contact_id);
CREATE INDEX idx_product_events_timestamp ON product_events(timestamp);
