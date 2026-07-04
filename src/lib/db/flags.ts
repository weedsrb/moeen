import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { highestPriority } from "@/lib/utils/flags";
import type { FlagPriority } from "@/types/flag";

export interface OpenFlagsSummary {
  count: number;
  highestPriority: FlagPriority | null;
}

/**
 * Count of open (unresolved) flags for a merchant plus the most severe
 * priority among them (used to color the sidebar Flags badge). Mirrors
 * getUnreadTotal — cache()-wrapped for the server render.
 */
export const getOpenFlagsSummary = cache(
  async (merchantId: string): Promise<OpenFlagsSummary> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("flags")
      .select("priority")
      .eq("merchant_id", merchantId)
      .eq("is_resolved", false);

    if (!data) return { count: 0, highestPriority: null };

    const priorities = data.map(
      (row: { priority: FlagPriority }) => row.priority
    );
    return {
      count: priorities.length,
      highestPriority: highestPriority(priorities),
    };
  }
);
