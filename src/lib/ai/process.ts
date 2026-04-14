import { createAdminClient } from "@/lib/supabase/admin";
import { WhatsAppProvider } from "@/lib/messaging/whatsapp";
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
    whatsappPhoneNumberId,
    whatsappAccessToken,
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
          chatId,
          whatsappPhoneNumberId,
          whatsappAccessToken,
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
      const { orderNumber } = await createOrderFromAI(supabase, {
        merchantId,
        customerId,
        conversationId,
        messageId,
        geminiResponse,
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
          chatId,
          whatsappPhoneNumberId,
          whatsappAccessToken,
          geminiResponse.clarifying_question
        );
        console.log(`${tag} | action | clarifying question sent via WhatsApp`);
      }
      return;
    }

    if (isAboveThreshold && hasMissingFields && !settings.autoClarity) {
      // Case C: High confidence, missing fields, auto-clarify off → create order + flag
      const { orderId, orderNumber } = await createOrderFromAI(supabase, {
        merchantId,
        customerId,
        conversationId,
        messageId,
        geminiResponse,
      });
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
      console.log(`${tag} | action | Case C → order ${orderNumber} + flag (missing fields)`);
      return;
    }

    // Case D: Low confidence → create order + flag + send handoff
    const { orderId, orderNumber } = await createOrderFromAI(supabase, {
      merchantId,
      customerId,
      conversationId,
      messageId,
      geminiResponse,
    });

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

    // Send handoff message to customer
    await sendAIMessage(
      supabase,
      merchantId,
      conversationId,
      chatId,
      whatsappPhoneNumberId,
      whatsappAccessToken,
      settings.handoffMessage
    );
    console.log(`${tag} | action | Case D → order ${orderNumber} + flag + handoff sent`);
  } catch (err) {
    console.error(`${tag} | ERROR |`, err);
  }
}

/**
 * Send a message from the AI to the customer via WhatsApp,
 * and save it to the messages table.
 */
async function sendAIMessage(
  supabase: ReturnType<typeof createAdminClient>,
  merchantId: string,
  conversationId: string,
  chatId: string,
  phoneNumberId: string,
  accessToken: string,
  text: string
): Promise<void> {
  console.log(`[AI Pipeline] sendAI | to=${chatId} | "${text.slice(0, 100)}"`);
  const provider = new WhatsAppProvider(phoneNumberId, accessToken);
  const result = await provider.sendMessage(chatId, text);
  console.log(`[AI Pipeline] sendAI | success=${result.success}, messageId=${result.messageId ?? "none"}`);

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
