-- ============================================================
-- Migration 023: catalog_imports audit log
-- ============================================================
--
-- One row per catalog-import batch (Excel/spreadsheet today, Instagram later),
-- so a bad parse can be traced back to its source file/sheet after the fact —
-- the same auditability instinct behind ai_decisions (migration 016).
--
-- Purely additive: no existing table is touched. The commit endpoint
-- (src/app/api/inventory/import/commit) logs here best-effort, so imports work
-- with or without this table — running this migration just turns the audit
-- trail on.

CREATE TABLE catalog_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid REFERENCES merchants ON DELETE CASCADE NOT NULL,
  source text NOT NULL DEFAULT 'excel'
    CHECK (source IN ('excel', 'instagram')),
  file_name text,
  sheet_name text,
  row_count integer NOT NULL DEFAULT 0,
  confirmed_count integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_catalog_imports_merchant_created
  ON catalog_imports (merchant_id, created_at DESC);

ALTER TABLE catalog_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Merchants can view own catalog imports"
  ON catalog_imports FOR SELECT
  USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));

CREATE POLICY "Merchants can insert own catalog imports"
  ON catalog_imports FOR INSERT
  WITH CHECK (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));
