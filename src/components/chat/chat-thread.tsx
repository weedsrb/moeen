"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRealtimeMessages } from "@/hooks/use-realtime-messages";
import { MessageBubble } from "./message-bubble";
import { Skeleton } from "@/components/ui/skeleton";
import type { Message } from "@/types/message";

interface ChatThreadProps {
  conversationId: string;
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

export function ChatThread({ conversationId }: ChatThreadProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    setMessages([]);

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
  }, [messages]);

  const handleNewMessage = useCallback((message: Message) => {
    setMessages((prev) => {
      // Avoid duplicates
      if (prev.some((m) => m.id === message.id)) return prev;
      return [...prev, message];
    });
  }, []);

  useRealtimeMessages(conversationId, handleNewMessage);

  if (loading) {
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

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">No messages yet</p>
      </div>
    );
  }

  // Group by date
  let lastDateKey = "";

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-2">
      {messages.map((message) => {
        const dateKey = getDateKey(message.created_at);
        const showSeparator = dateKey !== lastDateKey;
        lastDateKey = dateKey;

        return (
          <div key={message.id}>
            {showSeparator && (
              <div className="flex justify-center py-2">
                <span className="text-[10px] font-mono text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
                  {formatDateSeparator(message.created_at)}
                </span>
              </div>
            )}
            <MessageBubble message={message} />
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
