import { z } from "zod/v4";
import { createAdminClient } from "@/lib/supabase/admin";
import { processInboundMessage } from "@/lib/ai/process";
import {
  claimAIQueue,
  completeAIQueueMessage,
  failAIQueueMessage,
  type ClaimedAIMessage,
} from "@/lib/ai/queue";
import { getMerchantCredentials } from "@/lib/messaging/credentials";
import { getProvider } from "@/lib/messaging";

const payloadSchema = z.object({ message_id: z.string().uuid() });
const concurrency = boundedInteger(process.env.AI_WORKER_CONCURRENCY, 3, 1, 10);
const pollMs = boundedInteger(process.env.AI_WORKER_POLL_MS, 1_000, 250, 10_000);
const visibilitySeconds = boundedInteger(
  process.env.AI_WORKER_VISIBILITY_SECONDS,
  90,
  30,
  300
);
const heartbeatMs = 15_000;

let stopping = false;
let lastHeartbeat = 0;
const active = new Set<Promise<void>>();
const supabase = createAdminClient();

function boundedInteger(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed)
    ? Math.max(min, Math.min(max, parsed))
    : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorClass(error: unknown): string {
  if (error instanceof Error) return error.name.slice(0, 100) || "Error";
  return "unknown";
}

async function failClaim(
  queue: "ai_inbound" | "ai_ack_fallback",
  claim: ClaimedAIMessage,
  messageId: string,
  error: unknown
): Promise<void> {
  try {
    const status = await failAIQueueMessage(supabase, {
      queue,
      queueMessageId: claim.msg_id,
      messageId,
      readCount: claim.read_ct,
      errorClass: errorClass(error),
    });
    console.error(
      `[AI Worker] ${queue}/${claim.msg_id} failed → ${status}:`,
      error
    );
  } catch (markError) {
    console.error(`[AI Worker] could not persist queue failure:`, markError);
  }
}

async function processInboundClaim(claim: ClaimedAIMessage): Promise<void> {
  const parsed = payloadSchema.safeParse(claim.message);
  if (!parsed.success) {
    console.error(`[AI Worker] malformed ai_inbound payload ${claim.msg_id}`);
    return;
  }
  const messageId = parsed.data.message_id;

  try {
    const { data: message, error: messageError } = await supabase
      .from("messages")
      .select(
        "id, merchant_id, conversation_id, content, message_type, created_at, ai_processed"
      )
      .eq("id", messageId)
      .single();
    if (messageError || !message) throw new Error("Inbound message not found");

    const { data: conversation, error: conversationError } = await supabase
      .from("conversations")
      .select(
        "id, customer_id, platform, platform_chat_id, automation_mode"
      )
      .eq("id", message.conversation_id)
      .eq("merchant_id", message.merchant_id)
      .single();
    if (conversationError || !conversation) {
      throw new Error("Conversation not found");
    }

    if (message.ai_processed) {
      await completeAIQueueMessage(supabase, {
        queue: "ai_inbound",
        queueMessageId: claim.msg_id,
        messageId,
        status: "completed",
      });
      return;
    }

    const { data: latestInbound } = await supabase
      .from("messages")
      .select("id")
      .eq("conversation_id", conversation.id)
      .eq("direction", "inbound")
      .eq("message_type", "text")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestInbound && latestInbound.id !== messageId) {
      await completeAIQueueMessage(supabase, {
        queue: "ai_inbound",
        queueMessageId: claim.msg_id,
        messageId,
        status: "superseded",
      });
      return;
    }

    if (conversation.automation_mode !== "ai") {
      await completeAIQueueMessage(supabase, {
        queue: "ai_inbound",
        queueMessageId: claim.msg_id,
        messageId,
        status: "skipped",
      });
      return;
    }

    const credentials = await getMerchantCredentials(
      supabase,
      message.merchant_id,
      conversation.platform
    );
    if (!credentials) throw new Error("Channel credentials unavailable");

    await supabase
      .from("messages")
      .update({
        ai_processing_status: "processing",
        ai_attempt_count: claim.read_ct,
      })
      .eq("id", messageId);

    await processInboundMessage({
      messageId,
      merchantId: message.merchant_id,
      conversationId: conversation.id,
      customerId: conversation.customer_id,
      content: message.content,
      chatId: conversation.platform_chat_id,
      platform: conversation.platform,
      credentials,
      messageCreatedAt: message.created_at,
      executionMode: "queue",
    });

    const { data: completed } = await supabase
      .from("messages")
      .select("ai_processed")
      .eq("id", messageId)
      .single();
    if (!completed?.ai_processed) {
      throw new Error("Pipeline returned without completing the owned message");
    }

    await completeAIQueueMessage(supabase, {
      queue: "ai_inbound",
      queueMessageId: claim.msg_id,
      messageId,
      status: "completed",
    });
  } catch (error) {
    await failClaim("ai_inbound", claim, messageId, error);
  }
}

async function processAcknowledgementClaim(
  claim: ClaimedAIMessage
): Promise<void> {
  const parsed = payloadSchema.safeParse(claim.message);
  if (!parsed.success) {
    console.error(`[AI Worker] malformed ai_ack_fallback payload ${claim.msg_id}`);
    return;
  }
  const messageId = parsed.data.message_id;

  try {
    const { data: inbound, error: inboundError } = await supabase
      .from("messages")
      .select("id, merchant_id, conversation_id, created_at, ai_acknowledged_at")
      .eq("id", messageId)
      .single();
    if (inboundError || !inbound) throw new Error("Inbound message not found");

    const [{ data: conversation }, { data: response }, { data: settings }] =
      await Promise.all([
        supabase
          .from("conversations")
          .select("platform, platform_chat_id, automation_mode")
          .eq("id", inbound.conversation_id)
          .eq("merchant_id", inbound.merchant_id)
          .single(),
        supabase
          .from("messages")
          .select("id")
          .eq("conversation_id", inbound.conversation_id)
          .eq("direction", "outbound")
          .gt("created_at", inbound.created_at)
          .limit(1)
          .maybeSingle(),
        supabase
          .from("merchant_settings")
          .select("ai_acknowledgement_mode, ai_acknowledge_template")
          .eq("merchant_id", inbound.merchant_id)
          .single(),
      ]);

    if (
      inbound.ai_acknowledged_at ||
      response ||
      !conversation ||
      conversation.automation_mode !== "ai" ||
      settings?.ai_acknowledgement_mode !== "delayed" ||
      !settings.ai_acknowledge_template
    ) {
      await completeAIQueueMessage(supabase, {
        queue: "ai_ack_fallback",
        queueMessageId: claim.msg_id,
        messageId,
        status: "skipped",
      });
      return;
    }

    const idempotencyKey = `ai-ack:${messageId}`;
    const { data: existing } = await supabase
      .from("messages")
      .select("id, delivery_status")
      .eq("merchant_id", inbound.merchant_id)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existing) {
      await completeAIQueueMessage(supabase, {
        queue: "ai_ack_fallback",
        queueMessageId: claim.msg_id,
        messageId,
        status: "skipped",
      });
      return;
    }

    // Persist before the external call. A crash after sending leaves this row
    // in `sending`; retries suppress rather than risking a duplicate DM.
    const { data: outbound, error: reserveError } = await supabase
      .from("messages")
      .insert({
        merchant_id: inbound.merchant_id,
        conversation_id: inbound.conversation_id,
        platform_message_id: null,
        direction: "outbound",
        sender_type: "system",
        content: settings.ai_acknowledge_template,
        message_type: "text",
        has_order_signal: false,
        ai_processed: false,
        delivery_status: "sending",
        idempotency_key: idempotencyKey,
      })
      .select("id")
      .single();
    if (reserveError || !outbound) throw new Error("Could not reserve acknowledgement");

    const credentials = await getMerchantCredentials(
      supabase,
      inbound.merchant_id,
      conversation.platform
    );
    if (!credentials) throw new Error("Channel credentials unavailable");
    const result = await getProvider(
      conversation.platform,
      credentials
    ).sendMessage(conversation.platform_chat_id, settings.ai_acknowledge_template);

    await supabase
      .from("messages")
      .update({
        platform_message_id: result.messageId ?? null,
        delivery_status: result.success ? "sent" : "failed",
      })
      .eq("id", outbound.id);

    if (result.success) {
      const sentAt = new Date().toISOString();
      await Promise.all([
        supabase
          .from("messages")
          .update({ ai_acknowledged_at: sentAt })
          .eq("id", messageId),
        supabase
          .from("conversations")
          .update({
            last_message_at: sentAt,
            last_message_preview: settings.ai_acknowledge_template.slice(0, 100),
          })
          .eq("id", inbound.conversation_id),
      ]);
    }

    await completeAIQueueMessage(supabase, {
      queue: "ai_ack_fallback",
      queueMessageId: claim.msg_id,
      messageId,
      status: result.success ? "completed" : "skipped",
    });
  } catch (error) {
    await failClaim("ai_ack_fallback", claim, messageId, error);
  }
}

function track(task: Promise<void>): void {
  active.add(task);
  void task.finally(() => active.delete(task));
}

async function publishHeartbeat(): Promise<void> {
  const now = Date.now();
  if (now - lastHeartbeat < heartbeatMs) return;
  lastHeartbeat = now;

  const [{ data: merchants }, { data: pending }] = await Promise.all([
    supabase.from("merchants").select("id"),
    supabase
      .from("messages")
      .select("merchant_id, created_at")
      .eq("direction", "inbound")
      .in("ai_processing_status", ["queued", "processing", "retry_wait"])
      .limit(2_000),
  ]);
  const byMerchant = new Map<string, { count: number; oldest: number | null }>();
  for (const message of pending ?? []) {
    const current = byMerchant.get(message.merchant_id) ?? {
      count: 0,
      oldest: null,
    };
    const created = new Date(message.created_at).getTime();
    current.count += 1;
    current.oldest = current.oldest === null ? created : Math.min(current.oldest, created);
    byMerchant.set(message.merchant_id, current);
  }
  const heartbeatAt = new Date(now).toISOString();
  const rows = (merchants ?? []).map((merchant) => {
    const state = byMerchant.get(merchant.id) ?? { count: 0, oldest: null };
    return {
      merchant_id: merchant.id,
      worker_status: "healthy",
      queue_depth: state.count,
      oldest_message_age_seconds:
        state.oldest === null ? null : Math.max(0, Math.floor((now - state.oldest) / 1_000)),
      last_heartbeat_at: heartbeatAt,
      updated_at: heartbeatAt,
    };
  });
  if (rows.length > 0) {
    const { error } = await supabase
      .from("ai_queue_health")
      .upsert(rows, { onConflict: "merchant_id" });
    if (error) console.error(`[AI Worker] heartbeat failed: ${error.message}`);
  }
}

async function run(): Promise<void> {
  console.log(`[AI Worker] starting (concurrency=${concurrency})`);
  while (!stopping) {
    await publishHeartbeat();
    const capacity = concurrency - active.size;
    if (capacity <= 0) {
      await Promise.race([...active]);
      continue;
    }

    try {
      const acknowledgements = await claimAIQueue(
        supabase,
        "ai_ack_fallback",
        30,
        Math.min(2, capacity)
      );
      for (const claim of acknowledgements) {
        track(processAcknowledgementClaim(claim));
      }

      const remaining = concurrency - active.size;
      if (remaining > 0) {
        const inbound = await claimAIQueue(
          supabase,
          "ai_inbound",
          visibilitySeconds,
          remaining
        );
        for (const claim of inbound) track(processInboundClaim(claim));
      }

      if (active.size === 0) await sleep(pollMs);
    } catch (error) {
      console.error("[AI Worker] poll failed:", error);
      await sleep(Math.min(10_000, pollMs * 2));
    }
  }

  console.log(`[AI Worker] draining ${active.size} active job(s)`);
  await Promise.allSettled([...active]);
  await supabase
    .from("ai_queue_health")
    .update({ worker_status: "offline", updated_at: new Date().toISOString() })
    .neq("worker_status", "not_configured");
  console.log("[AI Worker] stopped");
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    stopping = true;
  });
}

void run().catch((error) => {
  console.error("[AI Worker] fatal:", error);
  process.exitCode = 1;
});
