-- Phase 8 — Messages experience refinement
-- 1. chat-media storage bucket (durable re-hosting of inbound IG images +
--    hosting of outbound merchant images so Instagram can fetch them by URL)
-- 2. messages.reply_to_message_id (Instagram-style quoted replies, both directions)
-- 3. orders.conversation_id becomes nullable (manual orders no longer mint a
--    synthetic conversation)

-- ------------------------------------------------------------
-- 1. chat-media storage bucket (mirrors 002_product_images_storage.sql)
-- ------------------------------------------------------------
-- Public read is required so (a) inbound re-hosted images render via a plain
-- <img src>, and (b) Instagram's Send API can fetch outbound image URLs.
-- Paths are merchant-scoped + random UUID, so URLs are unguessable.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-media',
  'chat-media',
  true,
  5242880,  -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
);

-- RLS: authenticated users can upload chat media (outbound sends).
-- Inbound re-hosting runs via the service-role admin client, which bypasses RLS.
CREATE POLICY "Authenticated users can upload chat media"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'chat-media'
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "Authenticated users can update chat media"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'chat-media'
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "Authenticated users can delete chat media"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'chat-media'
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "Chat media is publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'chat-media');

-- ------------------------------------------------------------
-- 2. messages.reply_to_message_id — quoted-parent link
-- ------------------------------------------------------------
-- Nullable; ON DELETE SET NULL so deleting a parent doesn't cascade-delete the
-- reply. The index on messages(platform_message_id) (migration 004) is reused
-- to resolve an inbound reply's reply_to.mid back to our message row.
ALTER TABLE messages
  ADD COLUMN reply_to_message_id uuid REFERENCES messages(id) ON DELETE SET NULL;

-- ------------------------------------------------------------
-- 3. orders.conversation_id becomes nullable
-- ------------------------------------------------------------
-- Manual orders no longer create a synthetic `platform:"manual"` conversation,
-- so an order can exist with no conversation. AI/IG orders still stamp one.
ALTER TABLE orders
  ALTER COLUMN conversation_id DROP NOT NULL;
