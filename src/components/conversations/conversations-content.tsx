"use client";

import { useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { useRealtimeConversations } from "@/hooks/use-realtime-conversations";
import {
  useUnreadCount,
  useUnreadCountSetter,
} from "@/components/layout/unread-count-provider";
import {
  ConversationList,
  type ConversationWithCustomer,
} from "./conversation-list";
import type { ChatSendRef } from "@/components/chat/chat-thread";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Conversation } from "@/types/message";

const ChatThread = dynamic(
  () => import("@/components/chat/chat-thread").then((m) => m.ChatThread),
  { ssr: false, loading: () => null }
);
const ReplyInput = dynamic(
  () => import("@/components/chat/reply-input").then((m) => m.ReplyInput),
  { ssr: false, loading: () => null }
);

interface ConversationsContentProps {
  initialConversations: ConversationWithCustomer[];
  merchantId: string;
}

export function ConversationsContent({
  initialConversations,
  merchantId,
}: ConversationsContentProps) {
  const [conversations, setConversations] =
    useState<ConversationWithCustomer[]>(initialConversations);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileShowChat, setMobileShowChat] = useState(false);

  const sendRef = useRef<ChatSendRef | null>(null);
  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  const unreadTotal = useUnreadCount();
  const setUnreadTotal = useUnreadCountSetter();

  const handleConversationUpdate = useCallback(
    (updated: Conversation) => {
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === updated.id);
        if (idx >= 0) {
          // Update existing conversation, preserve joined customer data
          const newList = [...prev];
          newList[idx] = { ...newList[idx], ...updated };
          // Re-sort by last_message_at
          newList.sort(
            (a, b) =>
              new Date(b.last_message_at ?? 0).getTime() -
              new Date(a.last_message_at ?? 0).getTime()
          );
          return newList;
        }
        // New conversation — add at top (customer data will be minimal)
        return [
          { ...updated, customers: null } as ConversationWithCustomer,
          ...prev,
        ];
      });
    },
    []
  );

  useRealtimeConversations(merchantId, handleConversationUpdate);

  function handleSelect(conversation: ConversationWithCustomer) {
    setSelectedId(conversation.id);
    setMobileShowChat(true);

    // Opening a conversation clears its unread server-side; reflect that
    // instantly here and in the sidebar Messages badge (realtime reconciles).
    const prevUnread = conversation.unread_count ?? 0;
    if (prevUnread > 0) {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversation.id ? { ...c, unread_count: 0 } : c
        )
      );
      setUnreadTotal(Math.max(0, unreadTotal - prevUnread));
    }
  }

  function handleBack() {
    setMobileShowChat(false);
  }

  const customerName = selected?.customers?.name ?? "Unknown";
  const customerAvatar = selected?.customers?.avatar_url ?? null;

  return (
    <div className="flex flex-1 min-h-0 rounded-lg border border-border overflow-hidden bg-card">
      {/* Conversation List — left panel */}
      <div
        className={cn(
          "w-full sm:w-80 sm:border-ie border-border shrink-0",
          mobileShowChat ? "hidden sm:block" : "block"
        )}
      >
        <ConversationList
          conversations={conversations}
          selectedId={selectedId}
          onSelect={handleSelect}
        />
      </div>

      {/* Chat Panel — right panel */}
      <div
        className={cn(
          "flex-1 flex flex-col min-w-0 sm:border-l border-border",
          !mobileShowChat ? "hidden sm:flex" : "flex"
        )}
      >
        {selected ? (
          <>
            {/* Chat header */}
            <div className="flex h-[57px] shrink-0 items-center gap-3 px-4 border-b border-border">
              <Button
                variant="ghost"
                size="icon"
                className="sm:hidden shrink-0"
                onClick={handleBack}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="relative h-8 w-8 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center text-xs font-medium overflow-hidden">
                {customerName
                  .split(" ")
                  .map((w: string) => w[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2)}
                {customerAvatar && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={customerAvatar}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                )}
              </div>
              <div>
                <p className="text-sm font-medium">{customerName}</p>
                <p className="text-[10px] text-muted-foreground">
                  {selected.platform === "instagram"
                    ? "Instagram"
                    : selected.platform === "whatsapp"
                      ? "WhatsApp"
                      : selected.platform}
                </p>
              </div>
            </div>

            {/* Messages */}
            <ChatThread conversationId={selected.id} onSendRef={sendRef} />

            {/* Reply */}
            <ReplyInput conversationId={selected.id} onSendRef={sendRef} />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">
              Select a conversation to start chatting
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
