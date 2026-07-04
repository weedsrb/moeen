"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Order } from "@/types/order";

export function useRealtimeOrders(
  merchantId: string,
  onUpdate: (order: Order, eventType: "INSERT" | "UPDATE" | "DELETE") => void
): void {
  const cbRef = useRef(onUpdate);
  useEffect(() => {
    cbRef.current = onUpdate;
  });

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`orders:${merchantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `merchant_id=eq.${merchantId}`,
        },
        (payload) => {
          const eventType = payload.eventType;
          const row = eventType === "DELETE" ? payload.old : payload.new;
          const order = row as Order;
          if (order) {
            cbRef.current(order, eventType);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [merchantId]);
}
