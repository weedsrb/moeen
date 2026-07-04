"use client";

import { useEffect } from "react";
import { unlockAudio } from "@/lib/utils/notification-sound";

/**
 * Browsers block audio until a user gesture. This registers a one-time
 * pointer/key listener that primes the shared AudioContext so later
 * notification sounds can play. Renders nothing.
 */
export function AudioUnlock() {
  useEffect(() => {
    const handler = () => {
      unlockAudio();
      window.removeEventListener("pointerdown", handler);
      window.removeEventListener("keydown", handler);
    };
    window.addEventListener("pointerdown", handler);
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("pointerdown", handler);
      window.removeEventListener("keydown", handler);
    };
  }, []);

  return null;
}
