"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRealtimeMessages } from "@/hooks/use-realtime-messages";
import { MessageBubble } from "./message-bubble";
import { Skeleton } from "@/components/ui/skeleton";
import type { Message } from "@/types/message";

interface OptimisticMessage {
  id: string;
  content: string;
  created_at: string;
  direction: "outbound";
  sender_type: "merchant";
  message_type: "text";
  failed?: boolean;
}

export interface ChatSendRef {
  addOptimistic: (content: string) => void;
  markFailed: (content: string) => void;
}

interface ChatThreadProps {
  conversationId: string;
  onSendRef?: React.MutableRefObject<ChatSendRef | null>;
}

function formatDateSeparator(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const dayMs = 86400000;

  if (diff < dayMs && now.getDate() === date.getDate()) return "Today";
  if (diff < dayMs * 2 && now.getDate() - date.getDate() === 1) return "Yesterday";

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

function getDateKey(dateStr: string): string {
  return new Date(dateStr).toDateString();
}

export function ChatThread({ conversationId, onSendRef }: ChatThreadProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [optimisticMessages, setOptimisticMessages] = useState<OptimisticMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [prevConversationId, setPrevConversationId] = useState(conversationId);

  // Reset state during render when conversation changes (React-recommended pattern)
  if (conversationId !== prevConversationId) {
    setPrevConversationId(conversationId);
    setLoading(true);
    setOptimisticMessages([]);
  }

  // Expose addOptimistic and markFailed to parent via ref
  useEffect(() => {
    if (onSendRef) {
      onSendRef.current = {
        addOptimistic: (content: string) => {
          const optimistic: OptimisticMessage = {
            id: `optimistic-${Date.now()}`,
            content,
            created_at: new Date().toISOString(),
            direction: "outbound",
            sender_type: "merchant",
            message_type: "text",
          };
          setOptimisticMessages((prev) => [...prev, optimistic]);
        },
        markFailed: (content: string) => {
          setOptimisticMessages((prev) => {
            // Find the most recent matching optimistic message and mark it failed
            const idx = [...prev].reverse().findIndex((o) => o.content === content && !o.failed);
            if (idx === -1) return prev;
            const actualIdx = prev.length - 1 - idx;
            const updated = [...prev];
            updated[actualIdx] = { ...updated[actualIdx], failed: true };
            return updated;
          });
        },
      };
    }
    return () => {
      if (onSendRef) {
        onSendRef.current = null;
      }
    };
  }, [onSendRef]);

  useEffect(() => {
    fetch(`/api/messages?conversationId=${conversationId}`)
      .then((res) => res.json())
      .then((data) => {
        setMessages(data.messages ?? []);
      })
      .finally(() => setLoading(false));
  }, [conversationId]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, optimisticMessages]);

  const handleNewMessage = useCallback((message: Message) => {
    setMessages((prev) => {
      // Avoid duplicates
      if (prev.some((m) => m.id === message.id)) return prev;
      return [...prev, message];
    });

    // Remove matching optimistic message when real outbound message arrives
    if (message.direction === "outbound" && message.sender_type === "merchant") {
      setOptimisticMessages((prev) =>
        prev.filter((o) => o.content !== message.content)
      );
    }
  }, []);

  useRealtimeMessages(conversationId, handleNewMessage);

  const handleRetry = useCallback(
    async (msg: OptimisticMessage) => {
      // Remove the failed message and re-add as fresh optimistic
      setOptimisticMessages((prev) => prev.filter((o) => o.id !== msg.id));
      const retryMsg: OptimisticMessage = {
        id: `optimistic-${Date.now()}`,
        content: msg.content,
        created_at: new Date().toISOString(),
        direction: "outbound",
        sender_type: "merchant",
        message_type: "text",
      };
      setOptimisticMessages((prev) => [...prev, retryMsg]);

      try {
        const res = await fetch("/api/messages/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId, content: msg.content }),
        });
        if (!res.ok) {
          setOptimisticMessages((prev) =>
            prev.map((o) => (o.id === retryMsg.id ? { ...o, failed: true } : o))
          );
        }
      } catch {
        setOptimisticMessages((prev) =>
          prev.map((o) => (o.id === retryMsg.id ? { ...o, failed: true } : o))
        );
      }
    },
    [conversationId]
  );

  if (loading && messages.length === 0) {
    return (
      <div className="flex-1 p-4 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className={`flex ${i % 2 === 0 ? "justify-start" : "justify-end"}`}
          >
            <Skeleton className="h-12 w-48 rounded-2xl" />
          </div>
        ))}
      </div>
    );
  }

  if (!loading && messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">No messages yet</p>
      </div>
    );
  }

  // Combine real messages with optimistic ones for display
  const allMessages: Array<Message | OptimisticMessage> = [
    ...messages,
    ...optimisticMessages,
  ];

  // Group by date
  let lastDateKey = "";

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-2">
      {allMessages.map((message) => {
        const dateKey = getDateKey(message.created_at);
        const showSeparator = dateKey !== lastDateKey;
        lastDateKey = dateKey;

        const isOptimistic = message.id.startsWith("optimistic-");
        const isFailed = isOptimistic && (message as OptimisticMessage).failed === true;

        // Build a full Message shape for optimistic messages
        const displayMessage: Message = isOptimistic
          ? {
              id: message.id,
              merchant_id: "",
              conversation_id: conversationId,
              platform_message_id: null,
              direction: "outbound",
              sender_type: "merchant",
              content: message.content,
              message_type: "text",
              media_url: null,
              has_order_signal: false,
              ai_processed: false,
              ai_result: null,
              created_at: message.created_at,
            }
          : (message as Message);

        return (
          <div
            key={message.id}
            className={
              isFailed
                ? undefined
                : isOptimistic
                  ? "opacity-60"
                  : undefined
            }
          >
            {showSeparator && (
              <div className="flex justify-center py-2">
                <span className="text-[10px] font-mono text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
                  {formatDateSeparator(message.created_at)}
                </span>
              </div>
            )}
            <div className={isFailed ? "flex flex-col items-end" : undefined}>
              <div className={isFailed ? "rounded-2xl ring-1 ring-red-500/30 bg-red-500/10" : undefined}>
                <MessageBubble message={displayMessage} />
              </div>
              {isFailed && (
                <button
                  onClick={() => handleRetry(message as OptimisticMessage)}
                  className="text-[11px] text-red-400 mt-0.5 hover:underline"
                >
                  Failed to send. Tap to retry
                </button>
              )}
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
