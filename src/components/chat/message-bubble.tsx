"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { isRtlText } from "@/lib/utils/text";
import { FileText, Share2, ImageOff } from "lucide-react";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import {
  Attachment,
  AttachmentMedia,
  AttachmentContent,
  AttachmentTitle,
  AttachmentTrigger,
} from "@/components/ui/attachment";
import { AudioPlayer } from "./audio-player";
import type { Message } from "@/types/message";

interface MessageBubbleProps {
  message: Message;
  /** Open an image in the lightbox. */
  onOpenImage?: (url: string) => void;
  /** Resolve the message this one replies to, for the quoted block. */
  resolveReply?: (id: string) => Message | undefined;
  /** Highlight a failed optimistic send. */
  failed?: boolean;
}

/** Media messages store "[image]"/"[voice]" etc. as content when there is no
 * real caption — don't render those bracket placeholders as text. Robust to
 * legacy rows whose placeholder used the raw platform kind (e.g. "[audio]",
 * "[story_mention]") rather than the mapped message_type. */
function isPlaceholderContent(message: Message): boolean {
  return (
    message.message_type !== "text" && /^\[[a-z_]+\]$/.test(message.content)
  );
}

/** Compact one-line preview of a replied-to message for the quoted block. */
function replyPreview(message: Message): string {
  if (message.message_type === "image") return "Photo";
  if (message.message_type === "voice") return "Voice message";
  if (message.message_type === "document") return "Document";
  return message.content;
}

/** In-bubble image with an aspect-preserving fit and a load placeholder.
 * Note: no `loading="lazy"` — a lazily-loaded image that starts hidden never
 * fires `onLoad`, which previously left the placeholder up forever. */
function ChatImage({
  src,
  onOpen,
}: {
  src: string;
  onOpen?: (url: string) => void;
}) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    "loading"
  );
  return (
    <button
      type="button"
      onClick={() => onOpen?.(src)}
      className="block overflow-hidden rounded-lg"
      aria-label="Open image"
    >
      {status !== "loaded" && (
        <div className="h-44 w-56 max-w-full">
          {status === "loading" ? (
            <div className="h-full w-full animate-pulse rounded-lg bg-foreground/10" />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-lg bg-foreground/5 text-xs text-muted-foreground">
              <ImageOff className="h-5 w-5" />
              Image unavailable
            </div>
          )}
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Attachment"
        onLoad={() => setStatus("loaded")}
        onError={() => setStatus("error")}
        className={cn(
          "block max-h-72 max-w-[min(20rem,100%)] rounded-lg object-contain",
          status !== "loaded" && "hidden"
        )}
      />
    </button>
  );
}

export function MessageBubble({
  message,
  onOpenImage,
  resolveReply,
  failed,
}: MessageBubbleProps) {
  const isOutbound = message.direction === "outbound";
  const isSystem = message.sender_type === "system";
  const isAi = message.sender_type === "ai";

  if (isSystem) {
    return (
      <div className="flex justify-center py-1">
        <p className="rounded-full bg-muted/40 px-3 py-1 text-xs italic text-muted-foreground">
          {message.content}
        </p>
      </div>
    );
  }

  const variant = isAi ? "ai" : isOutbound ? "merchant" : "customer";
  const align = isOutbound ? "end" : "start";

  const showCaption = message.content && !isPlaceholderContent(message);
  const captionRtl = isRtlText(message.content);
  const repliedTo = message.reply_to_message_id
    ? resolveReply?.(message.reply_to_message_id)
    : undefined;
  const repliedAuthor = repliedTo
    ? repliedTo.direction === "outbound"
      ? "You"
      : "Customer"
    : null;
  const voiceTone = isAi ? "ai" : isOutbound ? "merchant" : "customer";

  const isImage = message.message_type === "image" && !!message.media_url;
  const isVoice = message.message_type === "voice" && !!message.media_url;
  const isDocLike =
    !isImage &&
    !isVoice &&
    message.message_type !== "text" &&
    !!message.media_url;

  // Image-only messages get near-flush padding so the photo fills the bubble.
  const flushMedia = isImage && !showCaption && !message.reply_to_message_id;

  return (
    <Bubble variant={variant} align={align} className="max-w-[min(78%,32rem)]">
        <BubbleContent
          className={cn(
            "flex flex-col gap-1",
            flushMedia && "p-1",
            failed && "ring-1 ring-destructive/40"
          )}
        >
          {/* AI label — violet is reserved for AI content (color = meaning). */}
          {isAi && (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-violet-500">
              AI
            </span>
          )}

          {/* Quoted reply */}
          {message.reply_to_message_id && (
            <div className="rounded-md border-s-2 border-foreground/30 bg-foreground/5 px-2 py-1">
              <p className="text-[11px] font-medium text-foreground/70">
                {repliedAuthor ?? "Original message"}
              </p>
              <p
                className={cn(
                  "line-clamp-2 text-xs text-muted-foreground",
                  repliedTo &&
                    isRtlText(repliedTo.content) &&
                    "font-arabic leading-relaxed"
                )}
                dir={
                  repliedTo
                    ? isRtlText(repliedTo.content)
                      ? "rtl"
                      : "ltr"
                    : "ltr"
                }
              >
                {repliedTo ? replyPreview(repliedTo) : "Original message"}
              </p>
            </div>
          )}

          {/* Image */}
          {isImage && <ChatImage src={message.media_url!} onOpen={onOpenImage} />}

          {/* Voice note — inline player */}
          {isVoice && <AudioPlayer src={message.media_url!} tone={voiceTone} />}

          {/* Document / share attachment */}
          {isDocLike && (
            <Attachment size="sm" className="border-transparent bg-foreground/5">
              <AttachmentMedia>
                {message.message_type === "document" ? (
                  <FileText />
                ) : (
                  <Share2 />
                )}
              </AttachmentMedia>
              <AttachmentContent>
                <AttachmentTitle className="capitalize">
                  {message.message_type}
                </AttachmentTitle>
              </AttachmentContent>
              <AttachmentTrigger
                render={
                  <a
                    href={message.media_url!}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open ${message.message_type}`}
                  />
                }
              />
            </Attachment>
          )}

          {/* Text content / caption */}
          {showCaption && (
            <p
              className={cn(
                "whitespace-pre-wrap break-words text-sm",
                captionRtl ? "font-arabic leading-relaxed" : "leading-snug"
              )}
              dir={captionRtl ? "rtl" : "ltr"}
            >
              {message.content}
            </p>
          )}
        </BubbleContent>
    </Bubble>
  );
}
