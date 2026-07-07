-- Phase 8 (cont.) — allow voice notes / audio in the chat-media bucket.
-- Migration 021 created chat-media image-only. Inbound Instagram voice notes are
-- audio (typically audio/mp4 / .m4a) and their CDN URLs expire, so we re-host
-- them into this same bucket — which means the bucket must accept audio mimes.
-- Idempotent: safe to re-run.

UPDATE storage.buckets
SET
  allowed_mime_types = ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'audio/mp4', 'audio/aac', 'audio/mpeg', 'audio/ogg', 'audio/webm',
    'audio/wav', 'audio/x-wav'
  ],
  file_size_limit = 26214400  -- 25MB (voice notes can exceed the 5MB image cap)
WHERE id = 'chat-media';
