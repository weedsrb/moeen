-- Privacy-conscious AI telemetry. Store attribution and bounded metrics, never
-- the complete prompt or customer transcript.

ALTER TABLE ai_decisions
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS context_version integer,
  ADD COLUMN IF NOT EXISTS input_tokens integer,
  ADD COLUMN IF NOT EXISTS output_tokens integer,
  ADD COLUMN IF NOT EXISTS total_tokens integer,
  ADD COLUMN IF NOT EXISTS cached_input_tokens integer,
  ADD COLUMN IF NOT EXISTS latency_ms integer,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS finish_reason text,
  ADD COLUMN IF NOT EXISTS context_sizes jsonb,
  ADD COLUMN IF NOT EXISTS error_class text,
  ADD COLUMN IF NOT EXISTS reply_outcome text,
  ADD COLUMN IF NOT EXISTS requested_settings jsonb,
  ADD COLUMN IF NOT EXISTS effective_settings jsonb;

ALTER TABLE ai_decisions
  DROP CONSTRAINT IF EXISTS ai_decisions_reply_outcome_check;

ALTER TABLE ai_decisions
  ADD CONSTRAINT ai_decisions_reply_outcome_check
  CHECK (reply_outcome IS NULL OR reply_outcome IN ('none', 'sent', 'suppressed', 'failed'));

CREATE INDEX IF NOT EXISTS idx_ai_decisions_provider_model_created
  ON ai_decisions (provider, model_version, created_at DESC);

-- Populated by the queue/worker phases. Creating the read model now lets the UI
-- safely show "not configured" until the worker begins publishing heartbeats.
CREATE TABLE IF NOT EXISTS ai_queue_health (
  merchant_id uuid PRIMARY KEY REFERENCES merchants(id) ON DELETE CASCADE,
  worker_status text NOT NULL DEFAULT 'not_configured'
    CHECK (worker_status IN ('not_configured', 'healthy', 'degraded', 'offline')),
  queue_depth integer NOT NULL DEFAULT 0 CHECK (queue_depth >= 0),
  oldest_message_age_seconds integer,
  last_heartbeat_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_queue_health ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Merchants can view own AI queue health"
  ON ai_queue_health FOR SELECT
  USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));
