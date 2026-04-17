"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUnreadCountSetter } from "./unread-count-provider";

export default function UnreadCountSubscriber({
  merchantId,
}: {
  merchantId: string;
}) {
  const setCount = useUnreadCountSetter();

  useEffect(() => {
    const supabase = createClient();

    async function refetch() {
      const { data } = await supabase
        .from("conversations")
        .select("unread_count")
        .eq("merchant_id", merchantId);

      if (data) {
        const total = data.reduce(
          (sum: number, row: { unread_count: number | null }) =>
            sum + (row.unread_count ?? 0),
          0
        );
        setCount(total);
      }
    }

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
          refetch();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [merchantId, setCount]);

  return null;
}
