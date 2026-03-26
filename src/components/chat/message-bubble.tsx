"use client";

import { cn } from "@/lib/utils";
import type { Message } from "@/types/message";

interface MessageBubbleProps {
  message: Message;
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Heuristic: text is RTL if first meaningful char is Arabic/Hebrew */
function isRtlText(text: string): boolean {
  const rtlRegex = /[\u0600-\u06FF\u0750-\u077F\u0590-\u05FF]/;
  return rtlRegex.test(text.charAt(0));
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isOutbound = message.direction === "outbound";
  const isSystem = message.sender_type === "system";
  const isAi = message.sender_type === "ai";

  if (isSystem) {
    return (
      <div className="flex justify-center py-1">
        <p className="text-xs text-muted-foreground italic px-3 py-1 bg-muted/30 rounded-full">
          {message.content}
        </p>
      </div>
    );
  }

  const textDir = isRtlText(message.content) ? "rtl" : "ltr";

  return (
    <div
      className={cn(
        "flex",
        isOutbound ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "max-w-[75%] rounded-2xl px-4 py-2 space-y-1",
          isOutbound
            ? "bg-muted text-foreground rounded-ee-md"
            : isAi
              ? "bg-violet-500/10 text-foreground rounded-es-md"
              : "bg-blue-500/10 text-foreground rounded-es-md"
        )}
      >
        {/* Media indicator */}
        {message.message_type !== "text" && message.media_url && (
          <p className="text-xs text-muted-foreground italic">
            [{message.message_type}]
          </p>
        )}

        {/* Message content */}
        {message.content && (
          <p
            className="text-sm whitespace-pre-wrap break-words"
            dir={textDir}
          >
            {message.content}
          </p>
        )}

        {/* Timestamp */}
        <p
          className={cn(
            "text-[10px] font-mono text-muted-foreground",
            isOutbound ? "text-end" : "text-start"
          )}
        >
          {isAi && (
            <span className="text-violet-500 me-1">AI</span>
          )}
          {formatTime(message.created_at)}
        </p>
      </div>
    </div>
  );
}
