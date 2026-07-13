import type { SupabaseClient } from "@supabase/supabase-js";

export type AIExecutionBackend = "inline" | "queue";

export interface ClaimedAIMessage {
  msg_id: number;
  read_ct: number;
  enqueued_at: string;
  vt: string;
  message: { message_id?: unknown };
}

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

export async function claimAIQueue(
  supabase: SupabaseClient,
  queue: "ai_inbound" | "ai_ack_fallback",
  visibilitySeconds: number,
  batchSize: number
): Promise<ClaimedAIMessage[]> {
  const rpc = queue === "ai_inbound" ? "claim_ai_inbound" : "claim_ai_ack_fallback";
  const { data, error } = await supabase.rpc(rpc, {
    p_visibility_seconds: visibilitySeconds,
    p_batch_size: batchSize,
  });
  if (error) throw new Error(`Failed to claim ${queue}: ${error.message}`);
  return (data ?? []) as ClaimedAIMessage[];
}

export async function completeAIQueueMessage(
  supabase: SupabaseClient,
  params: {
    queue: "ai_inbound" | "ai_ack_fallback";
    queueMessageId: number;
    messageId: string;
    status: "completed" | "skipped" | "superseded";
  }
): Promise<void> {
  const { error } = await supabase.rpc("complete_ai_queue_message", {
    p_queue_name: params.queue,
    p_queue_message_id: params.queueMessageId,
    p_message_id: params.messageId,
    p_status: params.status,
  });
  if (error) throw new Error(`Failed to complete queue message: ${error.message}`);
}

export async function failAIQueueMessage(
  supabase: SupabaseClient,
  params: {
    queue: "ai_inbound" | "ai_ack_fallback";
    queueMessageId: number;
    messageId: string;
    readCount: number;
    errorClass: string;
  }
): Promise<"retry_wait" | "dead_letter"> {
  const { data, error } = await supabase.rpc("fail_ai_queue_message", {
    p_queue_name: params.queue,
    p_queue_message_id: params.queueMessageId,
    p_message_id: params.messageId,
    p_read_count: params.readCount,
    p_error_class: params.errorClass,
  });
  if (error) throw new Error(`Failed to mark queue failure: ${error.message}`);
  return data === "dead_letter" ? "dead_letter" : "retry_wait";
}
