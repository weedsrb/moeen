-- Mo'een Initial Schema
-- All tables, RLS policies, indexes, and functions

-- ============================================================
-- 1. WAITLIST (standalone, no FK dependencies)
-- ============================================================

CREATE TABLE waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts (public landing page form)
CREATE POLICY "Anyone can join waitlist"
  ON waitlist FOR INSERT
  WITH CHECK (true);

-- ============================================================
-- 2. MERCHANTS
-- ============================================================

CREATE TABLE merchants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL UNIQUE,
  business_name text NOT NULL,
  business_type text,
  city text,
  phone text,
  logo_url text,
  onboarding_completed boolean DEFAULT false,
  plan text DEFAULT 'free',
  monthly_order_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE merchants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Merchants can view own profile"
  ON merchants FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Merchants can insert own profile"
  ON merchants FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Merchants can update own profile"
  ON merchants FOR UPDATE
  USING (user_id = auth.uid());

-- ============================================================
-- 3. MERCHANT_SETTINGS
-- ============================================================

CREATE TABLE merchant_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid REFERENCES merchants ON DELETE CASCADE NOT NULL UNIQUE,
  telegram_bot_token text,
  telegram_connected boolean DEFAULT false,
  whatsapp_connected boolean DEFAULT false,
  ai_confidence_threshold decimal DEFAULT 0.70,
  ai_auto_clarify boolean DEFAULT true,
  ai_handoff_message text DEFAULT 'A team member will assist you shortly.',
  low_stock_threshold integer DEFAULT 5,
  quiet_hours_start time,
  quiet_hours_end time,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE merchant_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Merchants can view own settings"
  ON merchant_settings FOR SELECT
  USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));

CREATE POLICY "Merchants can insert own settings"
  ON merchant_settings FOR INSERT
  WITH CHECK (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));

CREATE POLICY "Merchants can update own settings"
  ON merchant_settings FOR UPDATE
  USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));

-- ============================================================
-- 4. CUSTOMERS
-- ============================================================

CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid REFERENCES merchants ON DELETE CASCADE NOT NULL,
  platform text NOT NULL,
  platform_user_id text NOT NULL,
  name text,
  phone text,
  delivery_address text,
  total_orders integer DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (merchant_id, platform, platform_user_id)
);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Merchants can view own customers"
  ON customers FOR SELECT
  USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));

CREATE POLICY "Merchants can insert own customers"
  ON customers FOR INSERT
  WITH CHECK (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));

CREATE POLICY "Merchants can update own customers"
  ON customers FOR UPDATE
  USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));

CREATE POLICY "Merchants can delete own customers"
  ON customers FOR DELETE
  USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));

-- ============================================================
-- 5. CONVERSATIONS
-- ============================================================

CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid REFERENCES merchants ON DELETE CASCADE NOT NULL,
  customer_id uuid REFERENCES customers ON DELETE CASCADE NOT NULL,
  platform text NOT NULL,
  platform_chat_id text NOT NULL,
  last_message_at timestamptz,
  last_message_preview text,
  unread_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Merchants can view own conversations"
  ON conversations FOR SELECT
  USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));

CREATE POLICY "Merchants can insert own conversations"
  ON conversations FOR INSERT
  WITH CHECK (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));

CREATE POLICY "Merchants can update own conversations"
  ON conversations FOR UPDATE
  USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));

CREATE POLICY "Merchants can delete own conversations"
  ON conversations FOR DELETE
  USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));

-- ============================================================
-- 6. MESSAGES
-- ============================================================

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid REFERENCES merchants ON DELETE CASCADE NOT NULL,
  conversation_id uuid REFERENCES conversations ON DELETE CASCADE NOT NULL,
  platform_message_id text,
  direction text NOT NULL,
  sender_type text NOT NULL,
  content text NOT NULL,
  message_type text DEFAULT 'text',
  media_url text,
  has_order_signal boolean DEFAULT false,
  ai_processed boolean DEFAULT false,
  ai_result jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_messages_conversation_created ON messages (conversation_id, created_at);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Merchants can view own messages"
  ON messages FOR SELECT
  USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));

CREATE POLICY "Merchants can insert own messages"
  ON messages FOR INSERT
  WITH CHECK (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));

CREATE POLICY "Merchants can update own messages"
  ON messages FOR UPDATE
  USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));

CREATE POLICY "Merchants can delete own messages"
  ON messages FOR DELETE
  USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));

-- ============================================================
-- 7. PRODUCTS
-- ============================================================

CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid REFERENCES merchants ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  alternative_names text[] DEFAULT '{}',
  description text,
  price decimal NOT NULL,
  currency text DEFAULT 'ILS',
  image_url text,
  quantity_total integer NOT NULL DEFAULT 0,
  quantity_reserved integer DEFAULT 0,
  low_stock_threshold integer,
  variants jsonb,
  is_active boolean DEFAULT true,
  instagram_post_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_products_merchant_active ON products (merchant_id, is_active);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Merchants can view own products"
  ON products FOR SELECT
  USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));

CREATE POLICY "Merchants can insert own products"
  ON products FOR INSERT
  WITH CHECK (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));

CREATE POLICY "Merchants can update own products"
  ON products FOR UPDATE
  USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));

CREATE POLICY "Merchants can delete own products"
  ON products FOR DELETE
  USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));

-- ============================================================
-- 8. ORDERS
-- ============================================================

CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid REFERENCES merchants ON DELETE CASCADE NOT NULL,
  customer_id uuid REFERENCES customers ON DELETE CASCADE NOT NULL,
  conversation_id uuid REFERENCES conversations ON DELETE CASCADE NOT NULL,
  order_number text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'incoming',
  delivery_address text,
  subtotal decimal DEFAULT 0,
  total decimal DEFAULT 0,
  currency text DEFAULT 'ILS',
  notes text,
  ai_confidence decimal,
  ai_extracted boolean DEFAULT false,
  source_message_id uuid REFERENCES messages,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  confirmed_at timestamptz,
  dispatched_at timestamptz,
  delivered_at timestamptz
);

CREATE INDEX idx_orders_merchant_status ON orders (merchant_id, status);
CREATE INDEX idx_orders_merchant_created ON orders (merchant_id, created_at);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Merchants can view own orders"
  ON orders FOR SELECT
  USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));

CREATE POLICY "Merchants can insert own orders"
  ON orders FOR INSERT
  WITH CHECK (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));

CREATE POLICY "Merchants can update own orders"
  ON orders FOR UPDATE
  USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));

CREATE POLICY "Merchants can delete own orders"
  ON orders FOR DELETE
  USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));

-- ============================================================
-- 9. ORDER_ITEMS
-- ============================================================

CREATE TABLE order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid REFERENCES merchants ON DELETE CASCADE NOT NULL,
  order_id uuid REFERENCES orders ON DELETE CASCADE NOT NULL,
  product_id uuid REFERENCES products,
  product_name text NOT NULL,
  variant text,
  quantity integer NOT NULL DEFAULT 1,
  unit_price decimal NOT NULL,
  subtotal decimal NOT NULL,
  ai_confidence decimal,
  ai_matched boolean DEFAULT false
);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Merchants can view own order items"
  ON order_items FOR SELECT
  USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));

CREATE POLICY "Merchants can insert own order items"
  ON order_items FOR INSERT
  WITH CHECK (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));

CREATE POLICY "Merchants can update own order items"
  ON order_items FOR UPDATE
  USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));

CREATE POLICY "Merchants can delete own order items"
  ON order_items FOR DELETE
  USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));

-- ============================================================
-- 10. ORDER_TIMELINE
-- ============================================================

CREATE TABLE order_timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid REFERENCES merchants ON DELETE CASCADE NOT NULL,
  order_id uuid REFERENCES orders ON DELETE CASCADE NOT NULL,
  from_status text,
  to_status text NOT NULL,
  changed_by text NOT NULL,
  note text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE order_timeline ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Merchants can view own order timeline"
  ON order_timeline FOR SELECT
  USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));

CREATE POLICY "Merchants can insert own order timeline"
  ON order_timeline FOR INSERT
  WITH CHECK (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));

-- ============================================================
-- 11. FLAGS
-- ============================================================

CREATE TABLE flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid REFERENCES merchants ON DELETE CASCADE NOT NULL,
  order_id uuid REFERENCES orders,
  conversation_id uuid REFERENCES conversations,
  message_id uuid REFERENCES messages,
  priority text NOT NULL,
  category text NOT NULL,
  title text NOT NULL,
  description text,
  recommended_action text,
  is_resolved boolean DEFAULT false,
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_flags_merchant_resolved_priority ON flags (merchant_id, is_resolved, priority);

ALTER TABLE flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Merchants can view own flags"
  ON flags FOR SELECT
  USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));

CREATE POLICY "Merchants can insert own flags"
  ON flags FOR INSERT
  WITH CHECK (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));

CREATE POLICY "Merchants can update own flags"
  ON flags FOR UPDATE
  USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));

CREATE POLICY "Merchants can delete own flags"
  ON flags FOR DELETE
  USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));

-- ============================================================
-- DATABASE FUNCTIONS
-- ============================================================

-- Generate human-readable order numbers: MOE-00001, MOE-00002, etc.
-- Per-merchant sequential
CREATE OR REPLACE FUNCTION generate_order_number(p_merchant_id uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  next_num integer;
  order_num text;
BEGIN
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(order_number FROM 5) AS integer)
  ), 0) + 1
  INTO next_num
  FROM orders
  WHERE merchant_id = p_merchant_id;

  order_num := 'MOE-' || LPAD(next_num::text, 5, '0');
  RETURN order_num;
END;
$$;

-- Increment monthly order count when order is created
CREATE OR REPLACE FUNCTION increment_monthly_order_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE merchants
  SET monthly_order_count = monthly_order_count + 1,
      updated_at = now()
  WHERE id = NEW.merchant_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_increment_monthly_order_count
  AFTER INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION increment_monthly_order_count();

-- Update inventory when order status changes
CREATE OR REPLACE FUNCTION update_inventory_on_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only act when status actually changes
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Moving to pending: reserve inventory
  IF NEW.status = 'pending' AND OLD.status = 'incoming' THEN
    UPDATE products p
    SET quantity_reserved = p.quantity_reserved + oi.quantity,
        updated_at = now()
    FROM order_items oi
    WHERE oi.order_id = NEW.id
      AND oi.product_id = p.id;
  END IF;

  -- Moving to confirmed: deduct from total, release reservation
  IF NEW.status = 'confirmed' AND OLD.status = 'pending' THEN
    UPDATE products p
    SET quantity_total = p.quantity_total - oi.quantity,
        quantity_reserved = p.quantity_reserved - oi.quantity,
        updated_at = now()
    FROM order_items oi
    WHERE oi.order_id = NEW.id
      AND oi.product_id = p.id;
  END IF;

  -- Moving to cancelled: release reservation
  IF NEW.status = 'cancelled' AND OLD.status IN ('incoming', 'pending') THEN
    -- Only release if there was a reservation (status was pending)
    IF OLD.status = 'pending' THEN
      UPDATE products p
      SET quantity_reserved = p.quantity_reserved - oi.quantity,
          updated_at = now()
      FROM order_items oi
      WHERE oi.order_id = NEW.id
        AND oi.product_id = p.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_inventory_on_status_change
  AFTER UPDATE OF status ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_inventory_on_status_change();

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Apply updated_at trigger to all tables that have it
CREATE TRIGGER trg_merchants_updated_at
  BEFORE UPDATE ON merchants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_merchant_settings_updated_at
  BEFORE UPDATE ON merchant_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
