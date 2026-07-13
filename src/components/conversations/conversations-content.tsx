"use client";

import { useState, useCallback, useRef, useMemo } from "react";
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
import {
  ConversationsFilterBar,
  type ConversationFilters,
} from "./conversations-filter-bar";
import type { ChatSendRef } from "@/components/chat/chat-thread";
import { Button } from "@/components/ui/button";
import { Bot, ChevronLeft, Loader2, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Conversation, Message } from "@/types/message";

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
  const [replyTarget, setReplyTarget] = useState<Message | null>(null);
  const [changingAutomation, setChangingAutomation] = useState(false);
  const [filters, setFilters] = useState<ConversationFilters>({
    search: "",
    status: "all",
    from: "",
    to: "",
  });

  const sendRef = useRef<ChatSendRef | null>(null);
  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  // Clear the reply target when switching conversations (render-phase reset).
  const [prevSelectedId, setPrevSelectedId] = useState(selectedId);
  if (selectedId !== prevSelectedId) {
    setPrevSelectedId(selectedId);
    setReplyTarget(null);
  }

  const filteredConversations = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    const fromMs = filters.from ? new Date(filters.from).getTime() : null;
    const toMs = filters.to ? new Date(`${filters.to}T23:59:59`).getTime() : null;

    return conversations.filter((c) => {
      if (q) {
        const customer = c.customers;
        const hit =
          (customer?.name?.toLowerCase().includes(q) ?? false) ||
          (customer?.platform_user_id?.toLowerCase().includes(q) ?? false) ||
          (customer?.phone?.toLowerCase().includes(q) ?? false);
        if (!hit) return false;
      }

      if (fromMs !== null || toMs !== null) {
        const t = c.last_message_at ? new Date(c.last_message_at).getTime() : 0;
        if (fromMs !== null && t < fromMs) return false;
        if (toMs !== null && t > toMs) return false;
      }

      if (filters.status !== "all") {
        const statuses = c.orders?.map((o) => o.status) ?? [];
        if (!statuses.includes(filters.status)) return false;
      }

      return true;
    });
  }, [conversations, filters]);

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

  function handleMarkUnread(conversation: ConversationWithCustomer) {
    setConversations((prev) =>
      prev.map((c) => (c.id === conversation.id ? { ...c, unread_count: 1 } : c))
    );
    setUnreadTotal(unreadTotal + 1);

    fetch(`/api/conversations/${conversation.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unread_count: 1 }),
    }).catch(() => {});
  }

  async function handleAutomationModeChange() {
    if (!selected || changingAutomation) return;
    const nextMode =
      selected.automation_mode === "human_takeover" ? "ai" : "human_takeover";
    const previousMode = selected.automation_mode;

    setChangingAutomation(true);
    setConversations((prev) =>
      prev.map((conversation) =>
        conversation.id === selected.id
          ? { ...conversation, automation_mode: nextMode }
          : conversation
      )
    );
    try {
      const response = await fetch(`/api/conversations/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ automation_mode: nextMode }),
      });
      if (!response.ok) throw new Error("Failed to update conversation mode");
      const payload = await response.json();
      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.id === selected.id
            ? { ...conversation, ...payload.conversation }
            : conversation
        )
      );
    } catch {
      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.id === selected.id
            ? { ...conversation, automation_mode: previousMode }
            : conversation
        )
      );
    } finally {
      setChangingAutomation(false);
    }
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
        <div className="flex h-full flex-col">
          <ConversationsFilterBar value={filters} onChange={setFilters} />
          <div className="min-h-0 flex-1">
            <ConversationList
              conversations={filteredConversations}
              selectedId={selectedId}
              onSelect={handleSelect}
              onMarkUnread={handleMarkUnread}
            />
          </div>
        </div>
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
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{customerName}</p>
                <p className="text-[10px] text-muted-foreground">
                  {selected.platform === "instagram"
                    ? "Instagram"
                    : selected.platform === "whatsapp"
                      ? "WhatsApp"
                      : selected.platform}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant={
                  selected.automation_mode === "human_takeover"
                    ? "default"
                    : "outline"
                }
                onClick={handleAutomationModeChange}
                disabled={changingAutomation}
                className="shrink-0 gap-1.5"
              >
                {changingAutomation ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : selected.automation_mode === "human_takeover" ? (
                  <Bot className="h-3.5 w-3.5" />
                ) : (
                  <UserRound className="h-3.5 w-3.5" />
                )}
                {selected.automation_mode === "human_takeover"
                  ? "Resume AI"
                  : "Take over"}
              </Button>
            </div>

            {/* Messages */}
            <ChatThread
              conversationId={selected.id}
              onSendRef={sendRef}
              onReply={setReplyTarget}
            />

            {/* Reply */}
            <ReplyInput
              conversationId={selected.id}
              onSendRef={sendRef}
              replyTarget={replyTarget}
              onClearReply={() => setReplyTarget(null)}
            />
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
