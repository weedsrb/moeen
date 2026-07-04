-- Realtime for side-menu notification badges.
-- The Messages badge already works because `conversations` is in the
-- supabase_realtime publication. `orders` and `flags` were never added, so the
-- Orders badge was silently non-realtime and a Flags badge was impossible.
-- Add both, and set REPLICA IDENTITY FULL so filtered UPDATE/DELETE events
-- (e.g. resolving a flag, order status changes) match the merchant_id filter.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE orders;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'flags'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE flags;
  END IF;
END $$;

ALTER TABLE orders REPLICA IDENTITY FULL;
ALTER TABLE flags REPLICA IDENTITY FULL;
