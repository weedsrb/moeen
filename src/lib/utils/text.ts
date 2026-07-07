/** Shared text helpers for the chat UI (RTL detection + time formatting). */

/** Heuristic: text is RTL if its first meaningful char is Arabic/Hebrew. */
export function isRtlText(text: string): boolean {
  const rtlRegex = /[؀-ۿݐ-ݿ֐-׿]/;
  return rtlRegex.test((text ?? "").trim().charAt(0));
}

/**
 * A short clock time, e.g. "11:20 AM". Uses `hour: "numeric"` (not "2-digit")
 * so it stays compact, and callers render it with `whitespace-nowrap` so the
 * AM/PM never wraps to its own line.
 */
export function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/**
 * Turn a raw send-API error into a merchant-friendly line. The most common
 * real failure is Instagram's 24-hour messaging window having closed — the
 * customer must message first before the merchant can reply.
 */
export function friendlySendError(raw?: string): string {
  const msg = (raw ?? "").toLowerCase();
  if (
    msg.includes("window") ||
    msg.includes("24 hour") ||
    msg.includes("24-hour") ||
    msg.includes("outside")
  ) {
    return "Can't reply yet — the customer needs to message first (24-hour window closed).";
  }
  if (msg.includes("not connected")) {
    return "Instagram isn't connected. Reconnect it in Settings.";
  }
  return raw && raw.trim() ? raw : "Failed to send.";
}
