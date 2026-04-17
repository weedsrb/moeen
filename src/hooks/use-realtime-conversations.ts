"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Conversation } from "@/types/message";

export function useRealtimeConversations(
  merchantId: string,
  onUpdate: (conversation: Conversation) => void
) {
  const cbRef = useRef(onUpdate);
  useEffect(() => {
    cbRef.current = onUpdate;
  });

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
            cbRef.current(conversation);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [merchantId]);
}
