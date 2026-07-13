import type { SupabaseClient } from "@supabase/supabase-js";

export type AIExecutionBackend = "inline" | "queue";

export async function getAIExecutionBackend(
  supabase: SupabaseClient
): Promise<AIExecutionBackend> {
  const { data, error } = await supabase
    .from("ai_runtime_settings")
    .select("ai_execution_backend")
    .eq("singleton", true)
    .maybeSingle();
  if (error) {
    console.error(`[AI Queue] runtime switch read failed: ${error.message}`);
    return "inline";
  }
  return data?.ai_execution_backend === "queue" ? "queue" : "inline";
}

export async function enqueueInboundAI(
  supabase: SupabaseClient,
  messageId: string,
  delaySeconds = 8
): Promise<number> {
  const { data, error } = await supabase.rpc("enqueue_ai_inbound", {
    p_message_id: messageId,
    p_delay_seconds: delaySeconds,
  });
  if (error) throw new Error(`Failed to enqueue AI message: ${error.message}`);
  return Number(data);
}

export async function enqueueAcknowledgementFallback(
  supabase: SupabaseClient,
  messageId: string,
  delaySeconds: number
): Promise<number> {
  const { data, error } = await supabase.rpc("enqueue_ai_ack_fallback", {
    p_message_id: messageId,
    p_delay_seconds: delaySeconds,
  });
  if (error) throw new Error(`Failed to enqueue acknowledgement: ${error.message}`);
  return Number(data);
}
