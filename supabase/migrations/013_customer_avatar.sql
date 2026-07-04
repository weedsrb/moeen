-- Store the customer's platform profile picture URL (e.g. Instagram profile_pic).
-- Populated by the webhook via InstagramProvider.resolveProfile; falls back to
-- initials in the UI when null. URLs are CDN-hosted and may expire — refreshed
-- on each inbound message via the customer upsert.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS avatar_url text;
