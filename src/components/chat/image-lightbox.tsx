"use client";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

interface ImageLightboxProps {
  /** The image URL to show, or null when closed. */
  url: string | null;
  onOpenChange: (open: boolean) => void;
}

/** Fullscreen image viewer opened from an image bubble in the chat thread. */
export function ImageLightbox({ url, onOpenChange }: ImageLightboxProps) {
  return (
    <Dialog open={!!url} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100%-2rem)] border-0 bg-transparent p-0 ring-0 sm:max-w-3xl">
        <DialogTitle className="sr-only">Image preview</DialogTitle>
        {url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt="Attachment"
            className="mx-auto max-h-[85vh] w-auto max-w-full rounded-lg object-contain"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
