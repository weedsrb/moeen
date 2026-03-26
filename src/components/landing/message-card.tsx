import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/lib/landing-data";

interface MessageCardProps {
  message: ChatMessage;
  className?: string;
}

export function MessageCard({ message, className }: MessageCardProps) {
  return (
    <div
      className={cn(
        "w-64 rounded-lg border border-border bg-card p-3 shadow-md",
        className
      )}
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-semibold font-arabic text-foreground">
          {message.sender}
        </span>
        <span className="font-mono text-xs text-muted-foreground">
          {message.time}
        </span>
      </div>
      <p className="font-arabic text-sm leading-relaxed text-muted-foreground" dir="rtl">
        {message.text}
      </p>
    </div>
  );
}
