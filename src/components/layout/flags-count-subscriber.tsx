"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useFlagsSummarySetter } from "./flags-count-provider";
import { highestPriority } from "@/lib/utils/flags";
import { playNotificationSound } from "@/lib/utils/notification-sound";
import type { FlagPriority } from "@/types/flag";

export default function FlagsCountSubscriber({
  merchantId,
  initialCount,
}: {
  merchantId: string;
  initialCount: number;
}) {
  const setSummary = useFlagsSummarySetter();
  // Seed with the server count so pre-existing flags never trigger a sound.
  const prevCountRef = useRef(initialCount);

  useEffect(() => {
    const supabase = createClient();

    async function refetch() {
      const { data } = await supabase
        .from("flags")
        .select("priority")
        .eq("merchant_id", merchantId)
        .eq("is_resolved", false);

      if (!data) return;

      const priorities = data.map(
        (row: { priority: FlagPriority }) => row.priority
      );
      const count = priorities.length;
      const highest = highestPriority(priorities);

      // Play a sound only when a new open flag was raised (count went up).
      if (count > prevCountRef.current) {
        playNotificationSound(
          highest === "critical" ? "flag-critical" : "flag"
        );
      }
      prevCountRef.current = count;

      setSummary({ count, highestPriority: highest });
    }

    const channel = supabase
      .channel(`flags-count:${merchantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "flags",
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
  }, [merchantId, setSummary]);

  return null;
}
