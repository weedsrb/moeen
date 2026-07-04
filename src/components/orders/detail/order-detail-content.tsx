"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeOrders } from "@/hooks/use-realtime-orders";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChatThread, type ChatSendRef } from "@/components/chat/chat-thread";
import { ReplyInput } from "@/components/chat/reply-input";
import { cn } from "@/lib/utils";
import { statusColorClass } from "@/lib/utils/orders";
import { ORDER_STATUS_LABELS } from "@/types/order";
import type { Order, OrderDetail } from "@/types/order";
import { OrderDataPanel } from "./order-data-panel";
import { OrderTimelinePanel } from "./order-timeline-panel";

interface OrderDetailContentProps {
  initialOrder: OrderDetail;
  merchantId: string;
}

async function fetchOrder(id: string): Promise<OrderDetail | null> {
  const response = await fetch(`/api/orders/${id}`);
  if (!response.ok) return null;
  const data = (await response.json()) as { order?: OrderDetail };
  return data.order ?? null;
}

function ChatPanel({
  conversationId,
  merchantId,
}: {
  conversationId: string;
  merchantId: string;
}) {
  const sendRef = useRef<ChatSendRef | null>(null);
  const [isManual, setIsManual] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    async function loadConversationPlatform() {
      const { data } = await supabase
        .from("conversations")
        .select("platform")
        .eq("id", conversationId)
        .eq("merchant_id", merchantId)
        .single();

      setIsManual(data?.platform === "manual");
    }

    loadConversationPlatform();
  }, [conversationId, merchantId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">Chat</h2>
        {isManual && (
          <p className="mt-1 text-xs text-muted-foreground">
            Manual order - no external channel
          </p>
        )}
      </div>
      <ChatThread conversationId={conversationId} onSendRef={sendRef} />
      <ReplyInput
        conversationId={conversationId}
        disabled={isManual}
        onSendRef={sendRef}
      />
    </div>
  );
}

export function OrderDetailContent({
  initialOrder,
  merchantId,
}: OrderDetailContentProps) {
  const [order, setOrder] = useState(initialOrder);
  const [mobileTab, setMobileTab] = useState<"chat" | "order" | "timeline">(
    "order"
  );
  const [desktopTab, setDesktopTab] = useState<"order" | "timeline">("order");

  const handleRealtimeOrder = useCallback(
    async (updated: Order, eventType: "INSERT" | "UPDATE" | "DELETE") => {
      if (updated.id !== order.id || eventType === "DELETE") return;
      const fresh = await fetchOrder(updated.id);
      if (fresh) setOrder(fresh);
    },
    [order.id]
  );

  useRealtimeOrders(merchantId, handleRealtimeOrder);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Order {order.order_number}</h1>
        <Badge
          variant="outline"
          className={cn("font-medium", statusColorClass(order.status))}
        >
          {ORDER_STATUS_LABELS[order.status]}
        </Badge>
      </div>

      <div className="hidden min-h-0 flex-1 gap-4 md:flex">
        <div className="flex min-w-0 basis-[40%]">
          <ChatPanel
            conversationId={order.conversation_id}
            merchantId={merchantId}
          />
        </div>
        <div className="min-w-0 flex-1 overflow-hidden rounded-lg border border-border bg-card p-4">
          <Tabs
            value={desktopTab}
            onValueChange={(v) =>
              v && setDesktopTab(v as "order" | "timeline")
            }
            className="h-full"
          >
            <TabsList>
              <TabsTrigger value="order">Order</TabsTrigger>
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
            </TabsList>
            <TabsContent value="order" className="overflow-y-auto pt-4">
              <OrderDataPanel order={order} onOrderChange={setOrder} />
            </TabsContent>
            <TabsContent value="timeline" className="overflow-y-auto pt-4">
              <OrderTimelinePanel
                entries={order.order_timeline}
                currentStatus={order.status}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <div className="min-h-0 flex-1 md:hidden">
        <Tabs
          value={mobileTab}
          onValueChange={(v) =>
            v && setMobileTab(v as "chat" | "order" | "timeline")
          }
          className="h-full"
        >
          <TabsList className="w-full">
            <TabsTrigger value="chat">Chat</TabsTrigger>
            <TabsTrigger value="order">Order</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
          </TabsList>
          <TabsContent value="chat" className="min-h-0 pt-3">
            <ChatPanel
              conversationId={order.conversation_id}
              merchantId={merchantId}
            />
          </TabsContent>
          <TabsContent value="order" className="overflow-y-auto pt-3">
            <OrderDataPanel order={order} onOrderChange={setOrder} />
          </TabsContent>
          <TabsContent value="timeline" className="overflow-y-auto pt-3">
            <OrderTimelinePanel
              entries={order.order_timeline}
              currentStatus={order.status}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
