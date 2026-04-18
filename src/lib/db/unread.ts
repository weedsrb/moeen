import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export const getUnreadTotal = cache(async (merchantId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("conversations")
    .select("unread_count")
    .eq("merchant_id", merchantId);

  if (!data) return 0;

  return data.reduce(
    (sum: number, row: { unread_count: number | null }) =>
      sum + (row.unread_count ?? 0),
    0
  );
});
