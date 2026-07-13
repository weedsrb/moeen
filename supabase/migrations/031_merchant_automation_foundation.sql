-- Merchant-facing operational automation. These tables never grant n8n direct
-- order mutation or access to channel/provider credentials.

CREATE TABLE merchant_automation_settings (
  merchant_id uuid PRIMARY KEY REFERENCES merchants(id) ON DELETE CASCADE,
  timezone text NOT NULL DEFAULT 'Asia/Hebron',
  notification_email text,
  email_verified_at timestamptz,
  email_enabled boolean NOT NULL DEFAULT false,
  email_critical_only boolean NOT NULL DEFAULT false,
  quiet_hours_start time,
  quiet_hours_end time,
  wait_medium_minutes integer NOT NULL DEFAULT 60 CHECK (wait_medium_minutes BETWEEN 5 AND 1440),
  wait_critical_minutes integer NOT NULL DEFAULT 120 CHECK (wait_critical_minutes BETWEEN 10 AND 2880),
  inventory_low_threshold integer NOT NULL DEFAULT 5 CHECK (inventory_low_threshold >= 0),
  stale_incoming_warning_minutes integer NOT NULL DEFAULT 30 CHECK (stale_incoming_warning_minutes >= 5),
  stale_incoming_critical_minutes integer NOT NULL DEFAULT 120 CHECK (stale_incoming_critical_minutes >= 10),
  stale_pending_hours integer NOT NULL DEFAULT 24 CHECK (stale_pending_hours >= 1),
  stale_confirmed_hours integer NOT NULL DEFAULT 48 CHECK (stale_confirmed_hours >= 1),
  daily_summary_time time NOT NULL DEFAULT '21:00',
  enabled_workflows jsonb NOT NULL DEFAULT '{
    "new_order_alerts": false,
    "customer_wait_alerts": false,
    "inventory_alerts": false,
    "stale_order_alerts": false,
    "daily_summary": false
  }'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO merchant_automation_settings (merchant_id)
SELECT id FROM merchants
ON CONFLICT (merchant_id) DO NOTHING;

CREATE OR REPLACE FUNCTION create_default_merchant_automation_settings()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO merchant_automation_settings (merchant_id)
  VALUES (NEW.id)
  ON CONFLICT (merchant_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_merchants_default_automation_settings ON merchants;
CREATE TRIGGER trg_merchants_default_automation_settings
  AFTER INSERT ON merchants
  FOR EACH ROW EXECUTE FUNCTION create_default_merchant_automation_settings();

CREATE TABLE merchant_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  flag_id uuid REFERENCES flags(id) ON DELETE SET NULL,
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
  category text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('info', 'low', 'medium', 'critical')),
  title text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'resolved')),
  dedupe_key text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, dedupe_key)
);

CREATE INDEX idx_merchant_notifications_open
  ON merchant_notifications (merchant_id, status, created_at DESC);

CREATE TABLE automation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  workflow_type text NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'claimed', 'completed', 'failed', 'deferred', 'cancelled')),
  idempotency_key text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  lease_expires_at timestamptz,
  completed_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  last_error_class text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, idempotency_key)
);

CREATE INDEX idx_automation_jobs_claim
  ON automation_jobs (status, scheduled_at, lease_expires_at);

CREATE TABLE automation_workflow_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid REFERENCES merchants(id) ON DELETE CASCADE,
  automation_job_id uuid REFERENCES automation_jobs(id) ON DELETE SET NULL,
  workflow_type text NOT NULL,
  execution_id text,
  error_class text NOT NULL,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE automation_email_usage (
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  usage_date date NOT NULL,
  sent_count integer NOT NULL DEFAULT 0 CHECK (sent_count >= 0),
  PRIMARY KEY (merchant_id, usage_date)
);

ALTER TABLE merchant_automation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_workflow_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_email_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Merchants manage own automation settings"
  ON merchant_automation_settings FOR ALL
  USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()))
  WITH CHECK (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));

CREATE POLICY "Merchants view own notifications"
  ON merchant_notifications FOR SELECT
  USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));
CREATE POLICY "Merchants update own notifications"
  ON merchant_notifications FOR UPDATE
  USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));

CREATE POLICY "Merchants view own automation jobs"
  ON automation_jobs FOR SELECT
  USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));
CREATE POLICY "Merchants view own automation errors"
  ON automation_workflow_errors FOR SELECT
  USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));
CREATE POLICY "Merchants view own email usage"
  ON automation_email_usage FOR SELECT
  USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));
