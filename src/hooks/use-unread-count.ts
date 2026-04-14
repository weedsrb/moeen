"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function useUnreadCount(merchantId: string) {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    // createClient() inside effect — avoids new object reference on every render
    const supabase = createClient();

    async function fetchUnread() {
      const { data } = await supabase
        .from("conversations")
        .select("unread_count")
        .eq("merchant_id", merchantId);

      if (data) {
        const total = data.reduce(
          (sum: number, c: { unread_count: number }) => sum + (c.unread_count ?? 0),
          0
        );
        setUnreadCount(total);
      }
    }

    fetchUnread();

    const channel = supabase
      .channel(`unread-${merchantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `merchant_id=eq.${merchantId}`,
        },
        () => {
          fetchUnread();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [merchantId]); // supabase not in deps — it's local to the effect

  return unreadCount;
}
