import type { SupabaseClient } from "@supabase/supabase-js";

export type ConversationAutomationMode = "ai" | "human_takeover";

const EXPLICIT_HUMAN_REQUEST = [
  /(?:بدي|اريد|عايز|ممكن|احكي|اكلم|كلموني|حولني).{0,24}(?:موظف|بني ادم|إنسان|انسان|شخص|مسؤول|المدير|صاحب المحل)/i,
  /(?:موظف|إنسان|انسان|شخص حقيقي|خدمة العملاء|المدير).{0,24}(?:لو سمحت|من فضلك|الان|هلأ)?/i,
  /\b(?:human|person|agent|representative|manager|customer service)\b/i,
  /\b(?:talk|speak|connect|transfer)\b.{0,24}\b(?:human|person|agent|representative|manager)\b/i,
];

export function isExplicitHumanRequest(message: string): boolean {
  const normalized = message.replace(/\s+/g, " ").trim();
  return EXPLICIT_HUMAN_REQUEST.some((pattern) => pattern.test(normalized));
}

export async function enterHumanTakeover(
  supabase: SupabaseClient,
  params: {
    merchantId: string;
    conversationId: string;
    reason:
      | "customer_requested"
      | "ai_escalation"
      | "merchant_replied"
      | "merchant_paused";
  }
): Promise<void> {
  const { error } = await supabase
    .from("conversations")
    .update({
      automation_mode: "human_takeover",
      takeover_reason: params.reason,
      taken_over_at: new Date().toISOString(),
      resumed_at: null,
    })
    .eq("id", params.conversationId)
    .eq("merchant_id", params.merchantId);
  if (error) throw new Error(`Failed to enter human takeover: ${error.message}`);
}
