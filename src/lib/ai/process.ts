import { createAdminClient } from "@/lib/supabase/admin";
import { getProvider, isWindowExpiredError } from "@/lib/messaging";
import { shouldProcess } from "./regex-filter";
import { assembleContext } from "./context";
import { callGemini } from "./gemini";
import { createOrderFromAI } from "./order-creator";
import type { PipelineInput, GeminiResponse } from "./types";

/**
 * Main AI pipeline orchestrator.
 * Called via `after()` from the webhook — runs in the background after
 * the webhook has already returned 200 to Meta.
 *
 * Flow: RegEx filter → context assembly → Gemini → decision tree
 */
export async function processInboundMessage(
  input: PipelineInput
): Promise<void> {
  const {
    messageId,
    merchantId,
    conversationId,
    customerId,
    content,
    chatId,
    platform,
    credentials,
  } = input;

  const supabase = createAdminClient();
  const tag = `[AI Pipeline] ${messageId.slice(0, 8)}`;

  try {
    console.log(`${tag} | START | "${content.slice(0, 80)}"`);

    // --- Step 1: Assemble context (includes last outbound sender type) ---
    const context = await assembleContext(
      supabase,
      merchantId,
      conversationId,
      content
    );
    console.log(
      `${tag} | context | ${context.conversationHistory.split("\n").length} messages, ${context.catalog.length} products, lastOutbound=${context.lastOutboundSenderType ?? "none"}`
    );

    // --- Step 2: RegEx pre-filter ---
    if (!shouldProcess(content, context.lastOutboundSenderType)) {
      console.log(`${tag} | regex | NO signal → skip AI`);
      await supabase
        .from("messages")
        .update({ has_order_signal: false, ai_processed: true })
        .eq("id", messageId);
      return;
    }
    console.log(`${tag} | regex | signal DETECTED → calling Gemini`);

    // Mark as having order signal
    await supabase
      .from("messages")
      .update({ has_order_signal: true })
      .eq("id", messageId);

    // --- Step 2b: Content-window dedup ---
    // A customer double-sending identical text produces distinct
    // platform_message_ids (so intake dedup misses it) but should not mint two
    // orders. If an identical inbound message in this conversation was already
    // AI-processed within the last 60s, skip this one. 60s is deliberate:
    // long enough for double-taps, short enough that a genuine repeat order
    // later still processes.
    const windowStart = new Date(Date.now() - 60_000).toISOString();
    const { data: duplicate } = await supabase
      .from("messages")
      .select("id")
      .eq("conversation_id", conversationId)
      .eq("direction", "inbound")
      .eq("content", content)
      .eq("ai_processed", true)
      .neq("id", messageId)
      .gte("created_at", windowStart)
      .limit(1)
      .maybeSingle();

    if (duplicate) {
      console.log(`${tag} | duplicate content within window → skip`);
      await supabase
        .from("messages")
        .update({ ai_processed: true })
        .eq("id", messageId);
      return;
    }

    // --- Step 3: Call Gemini (with 1 retry) ---
    let geminiResponse: GeminiResponse;
    try {
      geminiResponse = await callGemini(
        context.conversationHistory,
        context.catalog,
        {
          confidenceThreshold: context.settings.confidenceThreshold,
          currency: context.settings.currency,
        },
        content,
        context.merchantContext
      );
    } catch (firstError) {
      console.error(`${tag} | gemini | FAILED (attempt 1):`, firstError);
      try {
        geminiResponse = await callGemini(
          context.conversationHistory,
          context.catalog,
          {
            confidenceThreshold: context.settings.confidenceThreshold,
            currency: context.settings.currency,
          },
          content,
          context.merchantContext
        );
      } catch (secondError) {
        console.error(`${tag} | gemini | FAILED (attempt 2):`, secondError);
        console.log(`${tag} | action | flagged as ai_unavailable`);
        // Create flag: ai_unavailable
        await supabase.from("flags").insert({
          merchant_id: merchantId,
          conversation_id: conversationId,
          message_id: messageId,
          priority: "critical",
          category: "ai_unavailable",
          title: "AI processing failed",
          description: `Gemini API call failed after retry. Error: ${secondError instanceof Error ? secondError.message : "Unknown"}`,
          recommended_action:
            "Check GEMINI_API_KEY and API quota. Review the message manually.",
        });
        await supabase
          .from("messages")
          .update({ ai_processed: true })
          .eq("id", messageId);
        return;
      }
    }

    // --- Step 4: Save AI result to message ---
    console.log(
      `${tag} | gemini | intent=${geminiResponse.intent}, confidence=${(geminiResponse.confidence * 100).toFixed(0)}%, items=${geminiResponse.items.length}, missing=[${geminiResponse.missing_fields.join(",")}]`
    );
    if (geminiResponse.reasoning) {
      console.log(`${tag} | gemini | reasoning: ${geminiResponse.reasoning.slice(0, 200)}`);
    }
    if (geminiResponse.clarifying_question) {
      console.log(`${tag} | gemini | clarifying_question: ${geminiResponse.clarifying_question.slice(0, 150)}`);
    }

    await supabase
      .from("messages")
      .update({
        ai_processed: true,
        ai_result: geminiResponse as Record<string, unknown>,
      })
      .eq("id", messageId);

    // --- Step 5: Decision tree ---
    const { settings } = context;

    if (geminiResponse.intent === "other") {
      console.log(`${tag} | action | intent=other → no action`);
      return;
    }

    if (geminiResponse.intent === "question") {
      if (geminiResponse.answer) {
        console.log(`${tag} | action | intent=question → sending AI answer`);
        await sendAIMessage(
          supabase,
          merchantId,
          conversationId,
          messageId,
          chatId,
          platform,
          credentials,
          geminiResponse.answer
        );
      } else {
        console.log(`${tag} | action | intent=question → flag (customer_waiting, no answer generated)`);
        await supabase.from("flags").insert({
          merchant_id: merchantId,
          conversation_id: conversationId,
          message_id: messageId,
          priority: "low",
          category: "customer_waiting",
          title: "Customer question needs response",
          description: geminiResponse.reasoning,
          recommended_action: "Reply to the customer's question.",
        });
      }
      return;
    }

    // intent === "order"
    const isAboveThreshold =
      geminiResponse.confidence >= settings.confidenceThreshold;
    const hasMissingFields = geminiResponse.missing_fields.length > 0;
    console.log(
      `${tag} | decision | confidence=${(geminiResponse.confidence * 100).toFixed(0)}% (threshold=${(settings.confidenceThreshold * 100).toFixed(0)}%), aboveThreshold=${isAboveThreshold}, missingFields=${hasMissingFields}, autoClarity=${settings.autoClarity}`
    );

    if (isAboveThreshold && !hasMissingFields) {
      // Case A: High confidence, complete order → auto-create
      const { orderId, orderNumber, diagnostics } = await createOrderFromAI(
        supabase,
        {
          merchantId,
          customerId,
          conversationId,
          messageId,
          geminiResponse,
          catalog: context.catalog,
          currency: context.settings.currency,
        }
      );
      await flagInvalidProducts(supabase, {
        merchantId,
        orderId,
        conversationId,
        messageId,
        invalidProductIds: diagnostics.invalidProductIds,
      });
      console.log(`${tag} | action | Case A → order created: ${orderNumber}`);
      return;
    }

    if (isAboveThreshold && hasMissingFields && settings.autoClarity) {
      // Case B: High confidence but missing fields, auto-clarify enabled → send question
      console.log(`${tag} | action | Case B → sending clarifying question`);
      if (geminiResponse.clarifying_question) {
        await sendAIMessage(
          supabase,
          merchantId,
          conversationId,
          messageId,
          chatId,
          platform,
          credentials,
          geminiResponse.clarifying_question
        );
        console.log(`${tag} | action | clarifying question sent via ${platform}`);
      }
      return;
    }

    if (isAboveThreshold && hasMissingFields && !settings.autoClarity) {
      // Case C: High confidence, missing fields, auto-clarify off → create order + flag
      const { orderId, orderNumber, diagnostics } = await createOrderFromAI(
        supabase,
        {
          merchantId,
          customerId,
          conversationId,
          messageId,
          geminiResponse,
          catalog: context.catalog,
          currency: context.settings.currency,
        }
      );
      await supabase.from("flags").insert({
        merchant_id: merchantId,
        order_id: orderId,
        conversation_id: conversationId,
        message_id: messageId,
        priority: "medium",
        category: "ai_low_confidence",
        title: "Order created with missing details",
        description: `Missing: ${geminiResponse.missing_fields.join(", ")}. ${geminiResponse.reasoning}`,
        recommended_action:
          "Review the order and contact the customer for missing information.",
      });
      await flagInvalidProducts(supabase, {
        merchantId,
        orderId,
        conversationId,
        messageId,
        invalidProductIds: diagnostics.invalidProductIds,
      });
      console.log(`${tag} | action | Case C → order ${orderNumber} + flag (missing fields)`);
      return;
    }

    // Case D: Low confidence → create order + flag + send handoff
    const { orderId, orderNumber, diagnostics } = await createOrderFromAI(
      supabase,
      {
        merchantId,
        customerId,
        conversationId,
        messageId,
        geminiResponse,
        catalog: context.catalog,
        currency: context.settings.currency,
      }
    );

    await supabase.from("flags").insert({
      merchant_id: merchantId,
      order_id: orderId,
      conversation_id: conversationId,
      message_id: messageId,
      priority: "medium",
      category: "ai_low_confidence",
      title: "Low confidence order — needs review",
      description: `Confidence: ${(geminiResponse.confidence * 100).toFixed(0)}%. ${geminiResponse.reasoning}`,
      recommended_action:
        "Review the AI extraction and confirm or edit the order.",
    });

    await flagInvalidProducts(supabase, {
      merchantId,
      orderId,
      conversationId,
      messageId,
      invalidProductIds: diagnostics.invalidProductIds,
    });

    // Send handoff message to customer
    await sendAIMessage(
      supabase,
      merchantId,
      conversationId,
      messageId,
      chatId,
      platform,
      credentials,
      settings.handoffMessage
    );
    console.log(`${tag} | action | Case D → order ${orderNumber} + flag + handoff sent`);
  } catch (err) {
    console.error(`${tag} | ERROR |`, err);
  }
}

/**
 * Raise a merchant-visible flag when Gemini referenced product_ids that don't
 * exist in the catalog we sent. Those items were left unmatched by
 * validateExtraction, so the order needs a human to reconcile line items.
 * No-op when there are no invalid ids (keeps the 3 call sites clean).
 */
async function flagInvalidProducts(
  supabase: ReturnType<typeof createAdminClient>,
  params: {
    merchantId: string;
    orderId: string;
    conversationId: string;
    messageId: string;
    invalidProductIds: string[];
  }
): Promise<void> {
  const { merchantId, orderId, conversationId, messageId, invalidProductIds } =
    params;
  if (invalidProductIds.length === 0) return;

  console.log(
    `[AI Pipeline] ${messageId.slice(0, 8)} | ${invalidProductIds.length} unknown product(s) referenced → flag`
  );
  await supabase.from("flags").insert({
    merchant_id: merchantId,
    order_id: orderId,
    conversation_id: conversationId,
    message_id: messageId,
    priority: "medium",
    category: "ai_low_confidence",
    title: "AI referenced unknown products — review order items",
    description: `${invalidProductIds.length} item(s) referenced products not found in the catalog and were left unmatched. Review the order's items against the conversation.`,
    recommended_action:
      "Review the order items and match them to catalog products.",
  });
}

/**
 * Send a message from the AI to the customer via the conversation's channel,
 * and save it to the messages table. AI sends never use the HUMAN_AGENT tag.
 *
 * If the send is rejected because the platform's messaging window has expired
 * (e.g. Instagram's 24h window), a `customer_waiting` flag is raised instead
 * of silently swallowing the error.
 */
async function sendAIMessage(
  supabase: ReturnType<typeof createAdminClient>,
  merchantId: string,
  conversationId: string,
  messageId: string,
  chatId: string,
  platform: string,
  credentials: Record<string, string>,
  text: string
): Promise<void> {
  console.log(`[AI Pipeline] sendAI | to=${chatId} via ${platform} | "${text.slice(0, 100)}"`);
  const provider = getProvider(platform, credentials);
  const result = await provider.sendMessage(chatId, text);
  console.log(`[AI Pipeline] sendAI | success=${result.success}, messageId=${result.messageId ?? "none"}`);

  if (!result.success) {
    if (isWindowExpiredError(result.error)) {
      console.log(`[AI Pipeline] sendAI | window expired → flag customer_waiting`);
      await supabase.from("flags").insert({
        merchant_id: merchantId,
        conversation_id: conversationId,
        message_id: messageId,
        priority: "medium",
        category: "customer_waiting",
        title: "Reply blocked — messaging window expired",
        description: `The AI could not reply because the messaging window has closed. ${result.error ?? ""}`.trim(),
        recommended_action:
          "Reply to the customer manually from a channel that permits it.",
      });
    } else {
      console.error(`[AI Pipeline] sendAI | send failed: ${result.error ?? "unknown"}`);
    }
    return;
  }

  // Save outbound AI message to DB
  await supabase.from("messages").insert({
    merchant_id: merchantId,
    conversation_id: conversationId,
    platform_message_id: result.messageId ?? null,
    direction: "outbound",
    sender_type: "ai",
    content: text,
    message_type: "text",
    has_order_signal: false,
    ai_processed: false,
  });

  // Update conversation metadata
  await supabase
    .from("conversations")
    .update({
      last_message_at: new Date().toISOString(),
      last_message_preview: text.substring(0, 100),
    })
    .eq("id", conversationId);
}
