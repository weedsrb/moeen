"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SendHorizontal, Loader2, ImagePlus, X } from "lucide-react";
import { useMerchant } from "@/components/layout/merchant-provider";
import { uploadChatImage } from "@/lib/storage/upload-chat-image";
import { cn } from "@/lib/utils";
import { isRtlText, friendlySendError } from "@/lib/utils/text";
import type { ChatSendRef, OptimisticInput } from "./chat-thread";
import type { Message } from "@/types/message";

interface ReplyInputProps {
  conversationId: string;
  disabled?: boolean;
  onSendRef?: React.MutableRefObject<ChatSendRef | null>;
  /** Message being replied to (Instagram-style). */
  replyTarget?: Message | null;
  onClearReply?: () => void;
}

function replyPreview(message: Message): string {
  if (message.message_type === "image") return "Photo";
  if (message.message_type === "voice") return "Voice message";
  if (message.message_type === "document") return "Document";
  return message.content;
}

export function ReplyInput({
  conversationId,
  disabled,
  onSendRef,
  replyTarget,
  onClearReply,
}: ReplyInputProps) {
  const merchant = useMerchant();
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function clearImage() {
    setImageFile(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  async function handleSend() {
    const text = content.trim();
    if ((!text && !imageFile) || sending || uploading) return;

    const replyToMessageId = replyTarget?.id;

    // Upload the image first (need a public URL before we can send or optimistically render).
    let mediaUrl: string | undefined;
    if (imageFile) {
      setUploading(true);
      try {
        mediaUrl = await uploadChatImage(imageFile, merchant.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Image upload failed");
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    const payload: OptimisticInput = {
      content: text || undefined,
      mediaUrl,
      messageType: mediaUrl ? "image" : "text",
      replyToMessageId,
    };

    // Optimistic: show immediately, clear composer + reply target.
    onSendRef?.current?.addOptimistic(payload);
    setContent("");
    clearImage();
    onClearReply?.();
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    setSending(true);
    try {
      const res = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, ...payload }),
      });
      if (!res.ok) {
        const serverError = await res
          .json()
          .then((d) => d?.error as string | undefined)
          .catch(() => undefined);
        onSendRef?.current?.markFailed(payload, friendlySendError(serverError));
      }
    } catch {
      onSendRef?.current?.markFailed(
        payload,
        "Failed to send. Check your connection."
      );
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const busy = sending || uploading;

  return (
    <div className="border-t border-border p-3">
      {replyTarget && (
        <div className="mb-2 flex items-center gap-2 rounded-md border-s-2 border-foreground/30 bg-muted/40 px-2 py-1.5">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium text-muted-foreground">
              Replying to {replyTarget.direction === "outbound" ? "yourself" : "customer"}
            </p>
            <p
              className={cn(
                "truncate text-xs text-foreground",
                isRtlText(replyPreview(replyTarget)) && "font-arabic"
              )}
              dir={isRtlText(replyPreview(replyTarget)) ? "rtl" : "ltr"}
            >
              {replyPreview(replyTarget)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClearReply}
            className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-muted"
            aria-label="Cancel reply"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {imagePreview && (
        <div className="mb-2 flex items-center gap-2">
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imagePreview}
              alt="Attachment preview"
              className="h-16 w-16 rounded-md object-cover"
            />
            <button
              type="button"
              onClick={clearImage}
              className="absolute -end-1.5 -top-1.5 rounded-full bg-foreground p-0.5 text-background"
              aria-label="Remove image"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {error && <p className="mb-2 text-xs text-red-400">{error}</p>}

      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={handleImageSelect}
        />
        <Button
          size="icon"
          variant="ghost"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || busy}
          className="shrink-0"
          aria-label="Attach image"
        >
          <ImagePlus className="h-4 w-4" />
        </Button>
        <Textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          disabled={disabled || busy}
          dir={isRtlText(content) ? "rtl" : "ltr"}
          className={cn(
            "min-h-[40px] max-h-[120px] resize-none text-sm",
            isRtlText(content) && "font-arabic"
          )}
          rows={1}
        />
        <Button
          size="icon"
          onClick={handleSend}
          disabled={(!content.trim() && !imageFile) || busy || disabled}
          className="shrink-0"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <SendHorizontal className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
