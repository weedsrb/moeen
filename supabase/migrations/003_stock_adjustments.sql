-- Stock adjustments audit log
CREATE TABLE stock_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid REFERENCES merchants ON DELETE CASCADE NOT NULL,
  product_id uuid REFERENCES products ON DELETE CASCADE NOT NULL,
  adjustment integer NOT NULL,
  reason text NOT NULL,
  previous_quantity integer NOT NULL,
  new_quantity integer NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Index for fetching adjustments by product
CREATE INDEX idx_stock_adjustments_product ON stock_adjustments (product_id, created_at DESC);

-- Enable RLS
ALTER TABLE stock_adjustments ENABLE ROW LEVEL SECURITY;

-- Merchants can view their own stock adjustments
CREATE POLICY "Merchants can view own stock adjustments"
  ON stock_adjustments FOR SELECT
  USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));

-- Merchants can insert their own stock adjustments
CREATE POLICY "Merchants can insert own stock adjustments"
  ON stock_adjustments FOR INSERT
  WITH CHECK (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));
