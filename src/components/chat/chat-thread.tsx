"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { useRealtimeMessages } from "@/hooks/use-realtime-messages";
import { MessageBubble } from "./message-bubble";
import { ImageLightbox } from "./image-lightbox";
import {
  MessageScrollerProvider,
  MessageScroller,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerButton,
} from "@/components/ui/message-scroller";
import { Marker, MarkerContent } from "@/components/ui/marker";
import { Skeleton } from "@/components/ui/skeleton";
import { Reply } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTime, friendlySendError } from "@/lib/utils/text";
import type { Message } from "@/types/message";

export interface OptimisticInput {
  content?: string;
  mediaUrl?: string;
  messageType?: "text" | "image";
  replyToMessageId?: string;
}

interface OptimisticMessage {
  id: string;
  content: string;
  mediaUrl: string | null;
  messageType: "text" | "image";
  replyToMessageId: string | null;
  created_at: string;
  direction: "outbound";
  sender_type: "merchant";
  failed?: boolean;
  /** Human-friendly reason a failed send failed. */
  error?: string;
}

export interface ChatSendRef {
  addOptimistic: (input: OptimisticInput) => void;
  markFailed: (input: OptimisticInput, error?: string) => void;
}

interface ChatThreadProps {
  conversationId: string;
  onSendRef?: React.MutableRefObject<ChatSendRef | null>;
  /** Called when the merchant picks a message to reply to. */
  onReply?: (message: Message) => void;
}

// Consecutive messages from the same author within this gap are visually grouped.
const GROUP_GAP_MS = 5 * 60 * 1000;
// How far the thread slides left on a touch swipe to reveal timestamps.
const SWIPE_REVEAL_PX = 56;

function formatDateSeparator(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const dayMs = 86400000;

  if (diff < dayMs && now.getDate() === date.getDate()) return "Today";
  if (diff < dayMs * 2 && now.getDate() - date.getDate() === 1)
    return "Yesterday";

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

function getDateKey(dateStr: string): string {
  return new Date(dateStr).toDateString();
}

/** Author identity for grouping — same direction + sender_type = same author. */
function authorKey(m: { direction: string; sender_type: string }): string {
  return `${m.direction}:${m.sender_type}`;
}

function toOptimistic(input: OptimisticInput): OptimisticMessage {
  return {
    id: `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    content: input.content ?? "",
    mediaUrl: input.mediaUrl ?? null,
    messageType: input.messageType ?? "text",
    replyToMessageId: input.replyToMessageId ?? null,
    created_at: new Date().toISOString(),
    direction: "outbound",
    sender_type: "merchant",
  };
}

function matchesInput(o: OptimisticMessage, input: OptimisticInput): boolean {
  return (
    o.content === (input.content ?? "") &&
    o.mediaUrl === (input.mediaUrl ?? null)
  );
}

/** Hover/tap affordance to reply to a message; sits snug beside the bubble. */
function ReplyButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 rounded-full p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100 [@media(hover:none)]:hidden"
      aria-label="Reply"
    >
      <Reply className="h-4 w-4" />
    </button>
  );
}

export function ChatThread({
  conversationId,
  onSendRef,
  onReply,
}: ChatThreadProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [optimisticMessages, setOptimisticMessages] = useState<
    OptimisticMessage[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [prevConversationId, setPrevConversationId] = useState(conversationId);

  // Touch devices get a swipe-to-reveal timestamp gesture; pointer devices get
  // hover-to-reveal (pure CSS). `coarse` gates the Framer drag so desktop text
  // selection isn't hijacked.
  const [coarse, setCoarse] = useState(false);
  const swipeX = useMotionValue(0);
  const swipeOpacity = useTransform(swipeX, [-SWIPE_REVEAL_PX, 0], [1, 0]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(hover: none) and (pointer: coarse)");
    const update = () => setCoarse(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Reset state during render when conversation changes (React-recommended pattern)
  if (conversationId !== prevConversationId) {
    setPrevConversationId(conversationId);
    setLoading(true);
    setMessages([]);
    setOptimisticMessages([]);
  }

  // Expose addOptimistic and markFailed to parent via ref
  useEffect(() => {
    if (onSendRef) {
      onSendRef.current = {
        addOptimistic: (input: OptimisticInput) => {
          setOptimisticMessages((prev) => [...prev, toOptimistic(input)]);
        },
        markFailed: (input: OptimisticInput, error?: string) => {
          setOptimisticMessages((prev) => {
            const idx = [...prev]
              .reverse()
              .findIndex((o) => matchesInput(o, input) && !o.failed);
            if (idx === -1) return prev;
            const actualIdx = prev.length - 1 - idx;
            const updated = [...prev];
            updated[actualIdx] = {
              ...updated[actualIdx],
              failed: true,
              error: error ?? "Failed to send.",
            };
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
    let active = true;
    fetch(`/api/messages?conversationId=${conversationId}`)
      .then((res) => res.json())
      .then((data) => {
        if (active) setMessages(data.messages ?? []);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [conversationId]);

  const handleNewMessage = useCallback((message: Message) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === message.id)) return prev;
      return [...prev, message];
    });

    // Remove the matching optimistic entry when the real outbound merchant
    // message arrives. Match on content for text, or media_url for images
    // (whose content is empty).
    if (message.direction === "outbound" && message.sender_type === "merchant") {
      setOptimisticMessages((prev) =>
        prev.filter((o) => {
          if (message.media_url) return o.mediaUrl !== message.media_url;
          return o.content !== message.content;
        })
      );
    }
  }, []);

  useRealtimeMessages(conversationId, handleNewMessage);

  const handleRetry = useCallback(
    async (msg: OptimisticMessage) => {
      setOptimisticMessages((prev) => prev.filter((o) => o.id !== msg.id));
      const retryMsg = toOptimistic({
        content: msg.content || undefined,
        mediaUrl: msg.mediaUrl ?? undefined,
        messageType: msg.messageType,
        replyToMessageId: msg.replyToMessageId ?? undefined,
      });
      setOptimisticMessages((prev) => [...prev, retryMsg]);

      const fail = (error?: string) =>
        setOptimisticMessages((prev) =>
          prev.map((o) =>
            o.id === retryMsg.id
              ? { ...o, failed: true, error: error ?? "Failed to send." }
              : o
          )
        );

      try {
        const res = await fetch("/api/messages/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId,
            content: msg.content || undefined,
            mediaUrl: msg.mediaUrl ?? undefined,
            messageType: msg.messageType,
            replyToMessageId: msg.replyToMessageId ?? undefined,
          }),
        });
        if (!res.ok) {
          const serverError = await res
            .json()
            .then((d) => d?.error as string | undefined)
            .catch(() => undefined);
          fail(friendlySendError(serverError));
        }
      } catch {
        fail("Failed to send. Check your connection.");
      }
    },
    [conversationId]
  );

  const messageById = useMemo(() => {
    const map = new Map<string, Message>();
    for (const m of messages) map.set(m.id, m);
    return map;
  }, [messages]);

  const resolveReply = useCallback(
    (id: string) => messageById.get(id),
    [messageById]
  );

  const springBack = useCallback(() => {
    animate(swipeX, 0, { type: "spring", stiffness: 600, damping: 45 });
  }, [swipeX]);

  if (loading && messages.length === 0) {
    return (
      <div className="flex-1 space-y-3 p-4">
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
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">No messages yet</p>
      </div>
    );
  }

  const allMessages: Array<Message | OptimisticMessage> = [
    ...messages,
    ...optimisticMessages,
  ];
  const lastId = allMessages[allMessages.length - 1]?.id;

  let lastDateKey = "";

  return (
    <MessageScrollerProvider
      key={conversationId}
      autoScroll
      defaultScrollPosition="end"
    >
      <MessageScroller className="flex-1">
        <MessageScrollerViewport className="p-4">
          <MessageScrollerContent className="gap-1">
            {allMessages.map((message, i) => {
              const dateKey = getDateKey(message.created_at);
              const showSeparator = dateKey !== lastDateKey;
              lastDateKey = dateKey;

              const prev = allMessages[i - 1];
              const startsGroup =
                showSeparator ||
                !prev ||
                authorKey(prev) !== authorKey(message) ||
                new Date(message.created_at).getTime() -
                  new Date(prev.created_at).getTime() >
                  GROUP_GAP_MS;

              const isOptimistic = message.id.startsWith("optimistic-");
              const isFailed =
                isOptimistic && (message as OptimisticMessage).failed === true;

              const displayMessage: Message = isOptimistic
                ? {
                    id: message.id,
                    merchant_id: "",
                    conversation_id: conversationId,
                    platform_message_id: null,
                    direction: "outbound",
                    sender_type: "merchant",
                    content: (message as OptimisticMessage).content,
                    message_type: (message as OptimisticMessage).messageType,
                    media_url: (message as OptimisticMessage).mediaUrl,
                    reply_to_message_id: (message as OptimisticMessage)
                      .replyToMessageId,
                    has_order_signal: false,
                    ai_processed: false,
                    ai_result: null,
                    created_at: message.created_at,
                  }
                : (message as Message);

              const canReply =
                !isOptimistic &&
                displayMessage.sender_type !== "system" &&
                !!onReply;
              const isOutbound = displayMessage.direction === "outbound";
              const isSystem = displayMessage.sender_type === "system";

              return (
                <MessageScrollerItem
                  key={message.id}
                  messageId={message.id}
                  scrollAnchor={message.id === lastId}
                >
                  {showSeparator && (
                    <Marker variant="separator" className="my-3">
                      <MarkerContent className="font-mono text-[10px] uppercase tracking-wide">
                        {formatDateSeparator(message.created_at)}
                      </MarkerContent>
                    </Marker>
                  )}
                  <div
                    className={cn(
                      "group relative flex items-center",
                      startsGroup && !showSeparator && "mt-2"
                    )}
                  >
                    <motion.div
                      className={cn(
                        "flex min-w-0 flex-1 items-center gap-1.5",
                        isSystem
                          ? "justify-center"
                          : isOutbound
                            ? "justify-end"
                            : "justify-start",
                        isOptimistic && !isFailed && "opacity-60"
                      )}
                      // Pointer devices: bubble slides gracefully on hover to
                      // reveal the timestamp. Touch devices: swipe the thread.
                      variants={
                        !coarse && !isSystem
                          ? {
                              rest: { x: 0 },
                              revealed: { x: isOutbound ? -SWIPE_REVEAL_PX : 0 },
                            }
                          : undefined
                      }
                      initial={!coarse && !isSystem ? "rest" : undefined}
                      animate={!coarse && !isSystem ? "rest" : undefined}
                      whileHover={!coarse && !isSystem ? "revealed" : undefined}
                      transition={{
                        type: "tween",
                        ease: [0.22, 1, 0.36, 1],
                        duration: 0.34,
                      }}
                      style={coarse && !isSystem ? { x: swipeX } : undefined}
                      drag={coarse && !isSystem ? "x" : false}
                      dragConstraints={{ left: -SWIPE_REVEAL_PX, right: 0 }}
                      dragElastic={0.08}
                      dragDirectionLock
                      onDragEnd={springBack}
                    >
                      {canReply && isOutbound && (
                        <ReplyButton onClick={() => onReply?.(displayMessage)} />
                      )}
                      <MessageBubble
                        message={displayMessage}
                        onOpenImage={setLightboxUrl}
                        resolveReply={resolveReply}
                        failed={isFailed}
                      />
                      {canReply && !isOutbound && (
                        <ReplyButton onClick={() => onReply?.(displayMessage)} />
                      )}
                    </motion.div>

                    {/* Timestamp — hover reveal (pointer), fades in as the bubble slides */}
                    {!isSystem && (
                      <span className="pointer-events-none absolute end-1 top-1/2 hidden -translate-y-1/2 whitespace-nowrap font-mono text-[10px] text-muted-foreground opacity-0 transition-opacity duration-300 ease-out group-hover:opacity-100 [@media(hover:hover)]:block">
                        {formatTime(message.created_at)}
                      </span>
                    )}
                    {/* Timestamp — swipe reveal (touch devices) */}
                    {!isSystem && (
                      <motion.span
                        className="pointer-events-none absolute end-1 top-1/2 hidden -translate-y-1/2 whitespace-nowrap font-mono text-[10px] text-muted-foreground [@media(hover:none)]:block"
                        style={{ opacity: swipeOpacity }}
                      >
                        {formatTime(message.created_at)}
                      </motion.span>
                    )}
                  </div>
                  {isFailed && (
                    <div
                      className={cn(
                        "flex",
                        isOutbound ? "justify-end" : "justify-start"
                      )}
                    >
                      <button
                        onClick={() => handleRetry(message as OptimisticMessage)}
                        className="mt-0.5 text-end text-[11px] text-destructive hover:underline"
                      >
                        {(message as OptimisticMessage).error ??
                          "Failed to send."}{" "}
                        Tap to retry
                      </button>
                    </div>
                  )}
                </MessageScrollerItem>
              );
            })}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton direction="end" />
      </MessageScroller>
      <ImageLightbox
        url={lightboxUrl}
        onOpenChange={(open) => !open && setLightboxUrl(null)}
      />
    </MessageScrollerProvider>
  );
}
