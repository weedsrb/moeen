import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "chat-media";

const IMAGE_EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

const AUDIO_EXT_BY_MIME: Record<string, string> = {
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/webm": "weba",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};

/**
 * Fetch a time-limited Instagram CDN attachment once and re-host the bytes in
 * our public `chat-media` bucket so it stays viewable in chat history forever.
 *
 * Fails open: on any error the original URL is returned so the message is never
 * dropped — it just may 404 later once Instagram's link expires.
 */
async function rehost(
  url: string,
  merchantId: string,
  extByMime: Record<string, string>,
  fallbackMime: string
): Promise<string> {
  try {
    const res = await fetch(url);
    if (!res.ok) return url;

    const contentType = res.headers.get("content-type")?.split(";")[0]?.trim();
    const known = contentType && extByMime[contentType];
    const ext = known || extByMime[fallbackMime];
    const mime = known ? contentType : fallbackMime;
    const bytes = new Uint8Array(await res.arrayBuffer());

    const supabase = createAdminClient();
    const path = `${merchantId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: mime });
    if (error) return url;

    const {
      data: { publicUrl },
    } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return publicUrl;
  } catch {
    return url;
  }
}

/** Re-host an inbound Instagram image attachment (expiring CDN link). */
export function rehostInstagramImage(
  url: string,
  merchantId: string
): Promise<string> {
  return rehost(url, merchantId, IMAGE_EXT_BY_MIME, "image/jpeg");
}

/** Re-host an inbound Instagram voice note / audio attachment (expiring link). */
export function rehostInstagramAudio(
  url: string,
  merchantId: string
): Promise<string> {
  return rehost(url, merchantId, AUDIO_EXT_BY_MIME, "audio/mp4");
}
