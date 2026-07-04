"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Search } from "lucide-react";
import type { Conversation, Customer } from "@/types/message";

export interface ConversationWithCustomer extends Conversation {
  customers: Pick<Customer, "name" | "platform_user_id" | "avatar_url"> | null;
}

interface ConversationListProps {
  conversations: ConversationWithCustomer[];
  selectedId: string | null;
  onSelect: (conversation: ConversationWithCustomer) => void;
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

function getInitials(name: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
}: ConversationListProps) {
  const [search, setSearch] = useState("");

  const filtered = search.trim()
    ? conversations.filter((c) =>
        c.customers?.name?.toLowerCase().includes(search.toLowerCase())
      )
    : conversations;

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <MessageSquare className="h-10 w-10 text-muted-foreground/50 mb-3" />
        <p className="text-sm text-muted-foreground">
          No conversations yet. Messages from your WhatsApp number will appear
          here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-3 border-b border-border">
        <div className="relative">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search conversations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ps-9 text-sm"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.map((conversation) => {
          const isActive = conversation.id === selectedId;
          const customerName = conversation.customers?.name ?? "Unknown";

          return (
            <button
              key={conversation.id}
              onClick={() => onSelect(conversation)}
              className={cn(
                "w-full flex items-start gap-3 p-3 text-start transition-colors border-b border-border/50",
                isActive
                  ? "bg-accent"
                  : "hover:bg-accent/50"
              )}
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
            </button>
          );
        })}

        {filtered.length === 0 && search.trim() && (
          <p className="text-sm text-muted-foreground text-center py-8">
            No conversations match &ldquo;{search}&rdquo;
          </p>
        )}
      </div>
    </div>
  );
}
