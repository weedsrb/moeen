"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Conversation } from "@/types/message";

export function useRealtimeConversations(
  merchantId: string,
  onUpdate: (conversation: Conversation) => void
) {
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`conversations:${merchantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `merchant_id=eq.${merchantId}`,
        },
        (payload) => {
          const conversation = payload.new as Conversation;
          if (conversation) {
            onUpdate(conversation);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [merchantId, onUpdate]);
}
