"use client";

import { useCallback, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrdersCountSetter } from "./orders-count-provider";
import { playNotificationSound } from "@/lib/utils/notification-sound";
import type { OrderWithCustomer } from "@/types/order";

export function OrdersCountSubscriber({ merchantId }: { merchantId: string }) {
  const setCount = useOrdersCountSetter();
  // There is no server-provided initial count for orders (the mount refetch
  // establishes it), so skip the first load and seed prev from it.
  const hasLoadedRef = useRef(false);
  const prevCountRef = useRef(0);

  const refetch = useCallback(async () => {
    const [incomingResponse, pendingResponse] = await Promise.all([
      fetch("/api/orders?status=incoming&limit=500"),
      fetch("/api/orders?status=pending&limit=500"),
    ]);

    const incomingData = incomingResponse.ok
      ? ((await incomingResponse.json()) as { orders?: OrderWithCustomer[] })
      : { orders: [] };
    const pendingData = pendingResponse.ok
      ? ((await pendingResponse.json()) as { orders?: OrderWithCustomer[] })
      : { orders: [] };

    const count =
      (incomingData.orders?.length ?? 0) + (pendingData.orders?.length ?? 0);

    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
    } else if (count > prevCountRef.current) {
      playNotificationSound("order");
    }
    prevCountRef.current = count;

    setCount(count);
  }, [setCount]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`orders-count:${merchantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
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
  }, [merchantId, refetch]);

  return null;
}
