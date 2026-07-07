import { createClient } from "@/lib/supabase/client";

const BUCKET = "chat-media";

/**
 * Uploads a merchant-composed chat image directly from the browser to the
 * public `chat-media` bucket and returns its public URL. Mirrors the product
 * image upload in product-form.tsx. The public URL is needed both to render
 * the image and so Instagram's Send API can fetch it.
 */
export async function uploadChatImage(
  file: File,
  merchantId: string
): Promise<string> {
  const supabase = createClient();
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${merchantId}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file);
  if (error) throw new Error(`Image upload failed: ${error.message}`);

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return publicUrl;
}
