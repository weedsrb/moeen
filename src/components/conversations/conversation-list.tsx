"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { MessageSquare } from "lucide-react";
import type { Conversation, Customer } from "@/types/message";
import type { OrderStatus } from "@/types/order";

export interface ConversationWithCustomer extends Conversation {
  customers: Pick<
    Customer,
    "name" | "platform_user_id" | "avatar_url" | "phone"
  > | null;
  orders?: { status: OrderStatus }[] | null;
}

interface ConversationListProps {
  conversations: ConversationWithCustomer[];
  selectedId: string | null;
  onSelect: (conversation: ConversationWithCustomer) => void;
  onMarkUnread?: (conversation: ConversationWithCustomer) => void;
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Deliberately avoids `String.prototype.toUpperCase()` on the whole name:
 * Node's server-side ICU and the browser's ICU can map some non-Latin code
 * points (Arabic in particular) to different output, which produces a
 * server/client text mismatch and a hydration error. Only ASCII letters are
 * uppercased; other scripts (which have no case) pass through untouched and
 * render identically everywhere. `Array.from` (not `w[0]`) picks a full
 * grapheme instead of slicing a UTF-16 code unit in half.
 */
function getInitials(name: string | null): string {
  if (!name) return "?";
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const chars =
    words.length === 1
      ? Array.from(words[0]).slice(0, 2)
      : words.slice(0, 2).map((w) => Array.from(w)[0] ?? "");
  return chars.join("").replace(/[a-z]/g, (c) => c.toUpperCase());
}

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  onMarkUnread,
}: ConversationListProps) {
  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <MessageSquare className="h-10 w-10 text-muted-foreground/50 mb-3" />
        <p className="text-sm text-muted-foreground">
          No conversations match your filters.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        {conversations.map((conversation) => {
          const isActive = conversation.id === selectedId;
          const customerName = conversation.customers?.name ?? "Unknown";

          const phone = conversation.customers?.phone ?? null;
          const username = conversation.customers?.platform_user_id ?? null;

          return (
            <ContextMenu key={conversation.id}>
              <ContextMenuTrigger
                render={
                  <button
                    onClick={() => onSelect(conversation)}
                    className={cn(
                      "w-full flex items-start gap-3 p-3 text-start transition-colors border-b border-border/50",
                      isActive ? "bg-accent" : "hover:bg-accent/50"
                    )}
                  />
                }
              >
                {/* Avatar */}
                <div className="relative h-10 w-10 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center text-sm font-medium shrink-0 overflow-hidden">
                  {getInitials(customerName)}
                  {conversation.customers?.avatar_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={conversation.customers.avatar_url}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium truncate">{customerName}</p>
                    <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                      {formatRelativeTime(conversation.last_message_at)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className="text-xs text-muted-foreground truncate">
                      {conversation.last_message_preview ?? "No messages"}
                    </p>
                    {conversation.unread_count > 0 && (
                      <Badge
                        variant="default"
                        className="h-5 min-w-5 flex items-center justify-center px-1.5 text-[10px] shrink-0"
                      >
                        {conversation.unread_count}
                      </Badge>
                    )}
                  </div>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent>
                {onMarkUnread && conversation.unread_count === 0 && (
                  <ContextMenuItem onClick={() => onMarkUnread(conversation)}>
                    Mark as unread
                  </ContextMenuItem>
                )}
                {phone && (
                  <ContextMenuItem
                    onClick={() => navigator.clipboard.writeText(phone)}
                  >
                    Copy phone number
                  </ContextMenuItem>
                )}
                {username && (
                  <ContextMenuItem
                    onClick={() => navigator.clipboard.writeText(username)}
                  >
                    Copy username
                  </ContextMenuItem>
                )}
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
      </div>
    </div>
  );
}
