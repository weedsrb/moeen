"use client";

import { useState, useCallback } from "react";
import { useRealtimeConversations } from "@/hooks/use-realtime-conversations";
import {
  ConversationList,
  type ConversationWithCustomer,
} from "./conversation-list";
import { ChatThread } from "@/components/chat/chat-thread";
import { ReplyInput } from "@/components/chat/reply-input";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Conversation } from "@/types/message";

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

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

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
  }

  function handleBack() {
    setMobileShowChat(false);
  }

  const customerName = selected?.customers?.name ?? "Unknown";

  return (
    <div className="flex h-[calc(100vh-8rem)] sm:h-[calc(100vh-5rem)] rounded-lg border border-border overflow-hidden bg-card">
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
          "flex-1 flex flex-col min-w-0",
          !mobileShowChat ? "hidden sm:flex" : "flex"
        )}
      >
        {selected ? (
          <>
            {/* Chat header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
              <Button
                variant="ghost"
                size="icon"
                className="sm:hidden shrink-0"
                onClick={handleBack}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="h-8 w-8 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center text-xs font-medium">
                {customerName
                  .split(" ")
                  .map((w: string) => w[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2)}
              </div>
              <div>
                <p className="text-sm font-medium">{customerName}</p>
                <p className="text-[10px] text-muted-foreground">Telegram</p>
              </div>
            </div>

            {/* Messages */}
            <ChatThread conversationId={selected.id} />

            {/* Reply */}
            <ReplyInput conversationId={selected.id} />
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
