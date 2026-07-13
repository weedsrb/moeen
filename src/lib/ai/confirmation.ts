import type { SenderType } from "@/types/message";

export interface PersistedConfirmationState {
  awaiting_confirmation: boolean;
  last_readback: string | null;
}

export interface LastOutboundMessage {
  senderType: SenderType | null;
  content: string | null;
}

/**
 * Confirmation is authoritative only when the persisted collecting-order state
 * says a readback is pending and that exact readback is the most recent AI
 * outbound message. A model-emitted `confirmed` stage cannot bypass this gate.
 */
export function canAcceptConfirmation(
  state: PersistedConfirmationState | null,
  lastOutbound: LastOutboundMessage
): boolean {
  const readback = state?.last_readback?.trim();
  if (!state?.awaiting_confirmation || !readback) return false;

  return (
    lastOutbound.senderType === "ai" &&
    lastOutbound.content?.trim() === readback
  );
}
