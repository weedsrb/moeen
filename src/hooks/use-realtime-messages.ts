"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Message } from "@/types/message";

export function useRealtimeMessages(
  conversationId: string | null,
  onNewMessage: (message: Message) => void
) {
  useEffect(() => {
    if (!conversationId) return;

    const supabase = createClient();

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const message = payload.new as Message;
          if (message) {
            onNewMessage(message);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, onNewMessage]);
}
