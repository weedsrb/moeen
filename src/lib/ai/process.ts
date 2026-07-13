import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProvider, isWindowExpiredError } from "@/lib/messaging";
import { shouldProcess } from "./regex-filter";
import { classifyIntent } from "./classify-intent";
import { assembleContext } from "./context";
import { callGemini, AI_CONFIG } from "./gemini";
import {
  upsertCollectingOrder,
  promoteCollectingToIncoming,
  cancelCollectingOrder,
} from "./order-creator";
import {
  validateExtraction,
  hasHardAvailabilityProblem,
  isFinalizable,
  getStockShortfalls,
} from "./validate-extraction";
import type { PipelineInput, GeminiResponse, OrderStage } from "./types";
import type {
  ValidationDiagnostics,
  StockShortfall,
} from "./validate-extraction";
import { isGroundedProfileValue } from "./profile-grounding";
import {
  enterHumanTakeover,
  isExplicitHumanRequest,
} from "./human-takeover";

/**
 * How long the pipeline waits before processing an inbound message, so a
 * customer who splits one order across several rapid messages
 * ("بدي" / "3 كيلو" / "العنوان رام الله") gets a single coalesced run instead
 * of one Gemini call (and possibly one order) per fragment. Dev-owned.
 */
const DEBOUNCE_MS = 8_000;

/**
 * AI circuit-breaker tuning. When a merchant's Gemini calls fail repeatedly we
 * stop calling Gemini for a cooldown, fast-failing inbound order signals to
 * `ai_unavailable` flags instead of hammering a failing API. Persisted state
 * lives in merchant_settings.ai_status / ai_paused_at (migration 018).
 *
 *   - AI_FAILURE_WINDOW_MS   — how far back we count `ai_unavailable` failures.
 *   - AI_FAILURE_THRESHOLD   — failures inside that window that TRIP the breaker.
 *   - AI_PAUSE_COOLDOWN_MS   — how long it stays paused before a half-open probe.
 *
 * State machine: active → (>=THRESHOLD failures in WINDOW) → paused →
 * (fast-fail during COOLDOWN) → (COOLDOWN elapsed) → half-open probe →
 * success ? active : re-trip. It can never get permanently stuck because the
 * cooldown always eventually lets exactly one probe through.
 */
const AI_FAILURE_WINDOW_MS = 5 * 60_000;
const AI_PAUSE_COOLDOWN_MS = 10 * 60_000;
const AI_FAILURE_THRESHOLD = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
    messageCreatedAt,
    skipDebounce,
  } = input;

  const supabase = createAdminClient();
  const tag = `[AI Pipeline] ${messageId.slice(0, 8)}`;

  try {
    console.log(`${tag} | START | "${content.slice(0, 80)}"`);

    // Conversation ownership is a hard gate. A merchant reply, explicit
    // customer handoff, or manual pause puts the thread in human_takeover until
    // the merchant explicitly resumes AI.
    const { data: conversationControl, error: conversationControlError } =
      await supabase
        .from("conversations")
        .select("automation_mode")
        .eq("id", conversationId)
        .eq("merchant_id", merchantId)
        .single();
    if (conversationControlError || !conversationControl) {
      console.error(`${tag} | control | unable to verify conversation mode`);
      return;
    }
    if (conversationControl.automation_mode === "human_takeover") {
      console.log(`${tag} | control | human takeover active → skip AI`);
      await supabase
        .from("messages")
        .update({ ai_processed: true })
        .eq("id", messageId);
      return;
    }

    // --- Step 0: Burst debounce (last-message-wins) ---
    // Each rapid fragment schedules its own pipeline run. We sleep briefly;
    // only the LAST message of a burst proceeds and runs the pipeline over the
    // concatenated text, while earlier messages detect a successor and yield
    // (the successor's run owns the whole burst). The reprocess endpoint skips
    // this — it runs inline on a single historical message.
    let effectiveContent = content;
    let burstIds: string[] = [messageId];

    if (!skipDebounce) {
      await sleep(DEBOUNCE_MS);

      // Successor check: is there a newer inbound *text* message (the only kind
      // that runs this pipeline) in this conversation? Ordering by
      // (created_at, id) desc picks the single true "last" message and breaks
      // the theoretical tie of two messages sharing a created_at (higher id
      // wins). If the latest isn't us, a successor exists → yield WITHOUT
      // marking anything processed.
      const { data: latestInbound } = await supabase
        .from("messages")
        .select("id")
        .eq("conversation_id", conversationId)
        .eq("direction", "inbound")
        .eq("message_type", "text")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestInbound && latestInbound.id !== messageId) {
        console.log(`${tag} | debounce | superseded by newer message → yield`);
        return;
      }

      // Burst gather: the trailing run of unprocessed inbound text messages,
      // bounded to the last 5 minutes and 10 rows so we never swallow ancient
      // unprocessed rows. Concatenate oldest→newest into effectiveContent.
      const burstWindowStart = new Date(
        new Date(messageCreatedAt).getTime() - 5 * 60_000
      ).toISOString();
      const { data: burst } = await supabase
        .from("messages")
        .select("id, content")
        .eq("conversation_id", conversationId)
        .eq("direction", "inbound")
        .eq("message_type", "text")
        .eq("ai_processed", false)
        .gte("created_at", burstWindowStart)
        .order("created_at", { ascending: true })
        .limit(10);

      if (burst && burst.length > 0) {
        burstIds = burst.map((m) => m.id);
        effectiveContent = burst.map((m) => m.content).join("\n");
        // The triggering message must always be part of the burst.
        if (!burstIds.includes(messageId)) {
          burstIds.push(messageId);
          effectiveContent = `${effectiveContent}\n${content}`;
        }
      }

      console.log(
        `${tag} | debounce | burst of ${burstIds.length} message(s) → "${effectiveContent.slice(0, 80)}"`
      );
    }

    // --- Step 1: Assemble context (includes last outbound sender type) ---
    let context: Awaited<ReturnType<typeof assembleContext>>;
    try {
      context = await assembleContext(
        supabase,
        merchantId,
        conversationId,
        customerId,
        effectiveContent,
        burstIds
      );
    } catch (contextError) {
      const detail =
        contextError instanceof Error ? contextError.message : "Unknown context error";
      console.error(`${tag} | context | FAILED: ${detail}`);
      await supabase.from("flags").insert({
        merchant_id: merchantId,
        conversation_id: conversationId,
        message_id: messageId,
        priority: "critical",
        category: "ai_unavailable",
        title: "AI context unavailable",
        description:
          "Muin could not load the trusted business, customer, catalog, or conversation facts required to answer safely.",
        recommended_action:
          "Review the message manually and retry after the backend data is available.",
      });
      await supabase
        .from("messages")
        .update({ ai_processed: true })
        .in("id", burstIds);
      return;
    }
    console.log(
      `${tag} | context | ${context.conversationHistory.split("\n").length} messages, ${context.catalog.length} products, lastOutbound=${context.lastOutboundSenderType ?? "none"}`
    );

    if (isExplicitHumanRequest(effectiveContent)) {
      // Send one handoff acknowledgement, then lock the conversation to the
      // merchant. This bypasses both classifier and full-model ambiguity.
      await sendAIMessage(
        supabase,
        merchantId,
        conversationId,
        messageId,
        chatId,
        platform,
        credentials,
        context.settings.handoffMessage,
        { allowDuringTakeover: true }
      );
      await raiseHandoffFlag(supabase, {
        merchantId,
        conversationId,
        messageId,
        takeoverReason: "customer_requested",
      });
      await supabase
        .from("messages")
        .update({ has_order_signal: false, ai_processed: true })
        .in("id", burstIds);
      console.log(`${tag} | control | explicit human request → takeover`);
      return;
    }

    // --- Step 2: Intent gate (cold-start gate) ---
    // Replaces the old rigid regex pre-filter, which was a hard recall ceiling
    // (a real order phrased unusually never reached the model). A cheap/fast LLM
    // classifies intent so nothing real is dropped, while cost stays bounded.
    //
    // Decision order:
    //   1. ALWAYS PROCESS (skip the classifier) on mid-conversation signals —
    //      an open collecting draft, a reply to an AI message, or a bare number
    //      (a quantity answer). These are unambiguously part of a live order.
    //   2. Otherwise CLASSIFY: "order"/"question" → proceed; "other" → skip AI.
    //   3. Classifier error → FAIL OPEN to the regex filter, so a classifier
    //      outage can never drop a real order. If regex also says skip, skip.
    //
    // This gate NEVER writes an ai_decisions audit row — those stay proportional
    // to full-model (Gemini extraction) spend. We only console.log the decision.
    const isBareNumber = /^\d+$/.test(effectiveContent.trim());

    let proceed: boolean;
    if (context.hasOpenCollectingOrder) {
      proceed = true;
      console.log(`${tag} | gate | open collecting order → always process`);
    } else if (context.lastOutboundSenderType === "ai") {
      proceed = true;
      console.log(`${tag} | gate | reply to AI message → always process`);
    } else if (isBareNumber) {
      proceed = true;
      console.log(`${tag} | gate | bare number (quantity answer) → always process`);
    } else {
      // Cold conversation with no mid-order signal — ask the cheap classifier.
      try {
        const intent = await classifyIntent(
          effectiveContent,
          context.conversationHistory
        );
        proceed = intent === "order" || intent === "question";
        console.log(
          `${tag} | gate | classifier intent=${intent} → ${proceed ? "process" : "skip AI"}`
        );
      } catch (classifierError) {
        // FAIL OPEN: a classifier outage must never drop a real order. Fall back
        // to the regex filter — if it detects a signal we still process.
        const regexSignal = shouldProcess(
          effectiveContent,
          context.lastOutboundSenderType
        );
        proceed = regexSignal;
        console.error(`${tag} | gate | classifier error:`, classifierError);
        console.log(
          `${tag} | gate | classifier FAILED → fail-open to regex=${regexSignal ? "signal → process" : "no signal → skip AI"}`
        );
      }
    }

    if (!proceed) {
      await supabase
        .from("messages")
        .update({ has_order_signal: false, ai_processed: true })
        .in("id", burstIds);
      return;
    }

    // Mark as having order signal
    await supabase
      .from("messages")
      .update({ has_order_signal: true })
      .in("id", burstIds);

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
      .eq("content", effectiveContent)
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
        .in("id", burstIds);
      return;
    }

    // Hash the effective (burst-coalesced) content once. Every ai_decisions
    // audit row for this run is keyed by it, so identical inputs across runs
    // (e.g. re-scored after a prompt bump) stay comparable.
    const inputHash = createHash("sha256").update(effectiveContent).digest("hex");

    // --- Step 2c: Circuit breaker gate ---
    // We're now about to spend a Gemini call. If the breaker is tripped and
    // still cooling down, fast-fail to an ai_unavailable flag WITHOUT calling
    // Gemini. If the cooldown has elapsed, fall through as a single half-open
    // probe (a success later resets the breaker). Read once here and reuse the
    // in-memory value at the success point to avoid an extra query.
    const breakerState = await readBreakerState(supabase, merchantId);
    const breakerWasPaused = breakerState.status === "paused";

    if (breakerWasPaused && breakerState.pausedAt) {
      const cooldownRemaining =
        AI_PAUSE_COOLDOWN_MS -
        (Date.now() - new Date(breakerState.pausedAt).getTime());
      if (cooldownRemaining > 0) {
        console.log(`${tag} | breaker | paused (cooldown) → fast-fail`);
        await supabase.from("flags").insert({
          merchant_id: merchantId,
          conversation_id: conversationId,
          message_id: messageId,
          priority: "critical",
          category: "ai_unavailable",
          title: "AI paused — message not processed",
          description:
            "The AI pipeline is temporarily paused after repeated Gemini failures, so this message was not processed automatically. It resumes on its own after a short cooldown.",
          recommended_action:
            "Review the message manually. AI processing resumes automatically once the cooldown elapses.",
        });
        await supabase
          .from("messages")
          .update({ ai_processed: true })
          .in("id", burstIds);
        await recordDecision(supabase, {
          merchantId,
          conversationId,
          messageId,
          inputHash,
          decisionCase: "ai_unavailable",
          geminiConfidence: null,
        });
        return;
      }
      console.log(`${tag} | breaker | cooldown elapsed → half-open probe`);
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
        effectiveContent,
        context.merchantContext,
        context.orderSoFar,
        context.customerContext
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
          effectiveContent,
          context.merchantContext,
          context.orderSoFar,
          context.customerContext
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
          .in("id", burstIds);
        await recordDecision(supabase, {
          merchantId,
          conversationId,
          messageId,
          inputHash,
          decisionCase: "ai_unavailable",
          geminiConfidence: null,
        });
        // Breaker: this failure may be the one that trips the merchant into a
        // cooldown. Counts recent ai_unavailable flags (including the one just
        // inserted) and pauses if the threshold is met. Never throws.
        await maybeTripBreaker(supabase, merchantId, tag);
        return;
      }
    }

    // Gemini SUCCESS. If this run was a half-open probe (breaker was paused on
    // entry), the probe passed → reset the breaker to active. Guarded by the
    // in-memory flag so healthy merchants never issue this write.
    if (breakerWasPaused) {
      console.log(`${tag} | breaker | half-open probe succeeded → reset active`);
      await resetBreaker(supabase, merchantId);
    }

    // --- Step 4: Save AI result to message ---
    console.log(
      `${tag} | gemini | intent=${geminiResponse.intent}, stage=${geminiResponse.order_stage}, confidence=${(geminiResponse.confidence * 100).toFixed(0)}%, items=${geminiResponse.items.length}, missing=[${geminiResponse.missing_fields.join(",")}], needsHuman=${geminiResponse.needs_human}`
    );
    if (geminiResponse.reasoning) {
      console.log(`${tag} | gemini | reasoning: ${geminiResponse.reasoning.slice(0, 200)}`);
    }
    if (geminiResponse.reply_to_customer) {
      console.log(`${tag} | gemini | reply_to_customer: ${geminiResponse.reply_to_customer.slice(0, 150)}`);
    }

    // ai_processed applies to the whole burst; ai_result (the extraction) is
    // written only to the triggering (latest) message.
    await supabase
      .from("messages")
      .update({ ai_processed: true })
      .in("id", burstIds);
    await supabase
      .from("messages")
      .update({ ai_result: geminiResponse as Record<string, unknown> })
      .eq("id", messageId);

    // --- Step 5: Conversational stage machine ---
    // The model proposes a stage each turn; the pipeline resolves the REAL stage
    // deterministically (never trusting the model to upgrade past what's valid),
    // maintains the single open `collecting` draft, and sends exactly one reply.
    const { settings } = context;
    const escalate = geminiResponse.needs_human === true;
    const reply = geminiResponse.reply_to_customer;

    /** Send one reply to the customer via the conversation channel (no-op on null). */
    const sendReply = async (
      text: string | null,
      allowDuringTakeover = false
    ): Promise<void> => {
      if (!text) return;
      await sendAIMessage(
        supabase,
        merchantId,
        conversationId,
        messageId,
        chatId,
        platform,
        credentials,
        text,
        { allowDuringTakeover }
      );
    };

    // --- Non-order intents: no order side effects ---
    if (geminiResponse.intent === "other") {
      if (escalate) await raiseHandoffFlag(supabase, { merchantId, conversationId, messageId });
      await sendReply(escalate ? settings.handoffMessage : reply, escalate);
      console.log(`${tag} | action | intent=other → ${escalate ? "handoff" : reply ? "reply sent" : "no reply"}`);
      await recordDecision(supabase, {
        merchantId,
        conversationId,
        messageId,
        inputHash,
        decisionCase: "intent_other",
        geminiConfidence: geminiResponse.confidence,
      });
      return;
    }

    if (geminiResponse.intent === "question") {
      if (escalate) {
        await raiseHandoffFlag(supabase, { merchantId, conversationId, messageId });
        await sendReply(settings.handoffMessage, true);
      } else if (reply) {
        await sendReply(reply);
      } else {
        // No answer generated → surface to the merchant instead of ghosting.
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
      console.log(`${tag} | action | intent=question → ${escalate ? "handoff" : reply ? "answered" : "flagged"}`);
      await recordDecision(supabase, {
        merchantId,
        conversationId,
        messageId,
        inputHash,
        decisionCase: reply || escalate ? "question_answered" : "question_flagged",
        geminiConfidence: geminiResponse.confidence,
      });
      return;
    }

    // --- intent === "order": run the stage machine ---
    const validation = validateExtraction(geminiResponse, context.catalog);
    const hasMissing = geminiResponse.missing_fields.length > 0;
    const hardProblem = hasHardAvailabilityProblem(validation);
    const stockShortfalls = getStockShortfalls(validation, context.catalog);
    const finalizable = isFinalizable(validation, geminiResponse.missing_fields);
    const diagnostics = validation.diagnostics;
    const replyLanguage = resolveReplyLanguage(
      context.settings.responseLanguage,
      effectiveContent
    );

    await persistGroundedCustomerProfile(supabase, {
      merchantId,
      customerId,
      currentMessage: effectiveContent,
      existing: context.customerProfile,
      proposed: geminiResponse.customer_info,
    });

    // Resolve the real stage. Start from the model's, then FORCE it down: an
    // order with a hard availability problem, a still-missing required field, or
    // an active escalation can never be ready_to_confirm/confirmed — it keeps
    // collecting. An order-intent "none" is treated as collecting.
    let stage: OrderStage = geminiResponse.order_stage;
    let safeReply = reply;
    let confirmationGuardTriggered = false;
    if (stage === "none") stage = "collecting";
    if (
      stage !== "cancelled" &&
      (hardProblem || hasMissing || escalate) &&
      (stage === "ready_to_confirm" || stage === "confirmed")
    ) {
      stage = "collecting";
    }

    if (stage === "confirmed" && !context.canAcceptConfirmation) {
      confirmationGuardTriggered = true;
      stage = finalizable ? "ready_to_confirm" : "collecting";
      if (finalizable) {
        safeReply = buildConfirmationReadback(
          validation.items,
          geminiResponse.customer_info.delivery_address ??
            context.customerProfile.deliveryAddress,
          validation.total,
          context.settings.currency,
          replyLanguage
        );
      }
      console.warn(
        `${tag} | confirmation | rejected model confirmation without a persisted latest readback`
      );
    }
    console.log(
      `${tag} | stage | model=${geminiResponse.order_stage} → resolved=${stage} (missing=${hasMissing}, hardProblem=${hardProblem}, escalate=${escalate}, finalizable=${finalizable})`
    );

    // --- Cancellation: call off any open draft, send the reply ---
    if (stage === "cancelled") {
      if (context.collectingOrderId) {
        await cancelCollectingOrder(supabase, context.collectingOrderId, merchantId);
      }
      if (escalate) await raiseHandoffFlag(supabase, { merchantId, conversationId, messageId });
      await sendReply(escalate ? settings.handoffMessage : reply, escalate);
      console.log(`${tag} | action | order cancelled by customer${context.collectingOrderId ? ` → ${context.collectingOrderId.slice(0, 8)}` : ""}`);
      await recordDecision(supabase, {
        merchantId,
        conversationId,
        messageId,
        inputHash,
        decisionCase: "order_cancelled_by_customer",
        geminiConfidence: geminiResponse.confidence,
        orderId: context.collectingOrderId,
      });
      return;
    }

    // --- Upsert the single open collecting draft ---
    // Don't mint an empty draft on a first "I want to order" with no items yet;
    // once a draft exists we always update it.
    let orderId: string | null = context.collectingOrderId;
    if (context.collectingOrderId !== null || validation.items.length > 0) {
      const result = await upsertCollectingOrder(supabase, {
        merchantId,
        customerId,
        conversationId,
        messageId,
        geminiResponse,
        catalog: context.catalog,
        currency: context.settings.currency,
        collectingOrderId: context.collectingOrderId,
        collectionState: {
          missing_fields: geminiResponse.missing_fields,
          awaiting_confirmation:
            stage === "ready_to_confirm" ||
            (stage === "confirmed" && context.canAcceptConfirmation),
          last_readback:
            stage === "ready_to_confirm"
              ? safeReply
              : context.collectionState?.last_readback ?? null,
          customer_info: {
            name: geminiResponse.customer_info.name ?? context.customerProfile.name,
            phone:
              geminiResponse.customer_info.phone ?? context.customerProfile.phone,
            delivery_address:
              geminiResponse.customer_info.delivery_address ??
              context.customerProfile.deliveryAddress,
          },
        },
      });
      orderId = result.orderId;

      await flagInvalidProducts(supabase, {
        merchantId,
        orderId,
        conversationId,
        messageId,
        invalidProductIds: diagnostics.invalidProductIds,
      });
      await flagStockAndVariantIssues(supabase, {
        merchantId,
        orderId,
        conversationId,
        messageId,
        outOfStockItems: diagnostics.outOfStockItems ?? [],
        invalidVariants: diagnostics.invalidVariants ?? [],
      });
    }

    // --- Finalize gate: promote ONLY when the model confirmed AND the order is
    // deterministically finalizable (which, by the force-down above, already
    // implies no hard problem / no missing field / no escalation). ---
    if (stage === "confirmed" && finalizable && orderId) {
      await promoteCollectingToIncoming(supabase, orderId, merchantId);
      // Prefer the model's acknowledgement; fall back to a short templated ack.
      await sendReply(
        escalate
          ? settings.handoffMessage
          : safeReply ?? localizedOrderPlaced(replyLanguage),
        escalate
      );
      if (escalate) await raiseHandoffFlag(supabase, { merchantId, conversationId, messageId });
      console.log(`${tag} | action | order confirmed → promoted ${orderId.slice(0, 8)} to incoming`);
      await recordDecision(supabase, {
        merchantId,
        conversationId,
        messageId,
        inputHash,
        decisionCase: "order_confirmed",
        geminiConfidence: geminiResponse.confidence,
        orderId,
        validationDiagnostics: diagnostics,
      });
      return;
    }

    // --- Still collecting / awaiting confirmation: send exactly one reply ---
    // Truth override: if a hard stock shortfall exists and the model's reply
    // didn't state the real available amount, replace it with a deterministic
    // availability notice so the customer is never misled. Escalation wins.
    let outgoing: string | null;
    if (escalate) {
      outgoing = settings.handoffMessage;
      await raiseHandoffFlag(supabase, { merchantId, conversationId, messageId });
    } else if (
      stockShortfalls.length > 0 &&
      !replyStatesShortfalls(safeReply, stockShortfalls)
    ) {
      outgoing = buildStockShortfallReply(stockShortfalls, replyLanguage);
      console.log(`${tag} | stock | reply did not surface shortfall → overriding with availability notice`);
    } else {
      outgoing = safeReply;
    }
    await sendReply(outgoing, escalate);

    const decisionCase =
      stage === "ready_to_confirm" ? "order_ready_to_confirm" : "order_collecting";
    console.log(
      `${tag} | action | stage=${stage} → reply ${outgoing ? "sent" : "none"}, order=${orderId ? orderId.slice(0, 8) : "none (awaiting first item)"}${confirmationGuardTriggered ? ", confirmationGuard=blocked" : ""}`
    );
    await recordDecision(supabase, {
      merchantId,
      conversationId,
      messageId,
      inputHash,
      decisionCase,
      geminiConfidence: geminiResponse.confidence,
      orderId,
      validationDiagnostics: diagnostics,
    });
  } catch (err) {
    console.error(`${tag} | ERROR |`, err);
  }
}

/**
 * Insert one immutable `ai_decisions` audit row attributing this pipeline run
 * to an exact model/prompt revision and its terminal decision. Fire-and-forget:
 * any failure is logged and swallowed — auditing must NEVER break the pipeline.
 *
 * Called only at the post-Gemini terminal points (one row per Gemini call), so
 * audit volume tracks AI spend, not raw chat volume. `effective_confidence`
 * mirrors the raw model score today; it is reserved for a future deterministic
 * re-scoring layer.
 */
async function recordDecision(
  supabase: ReturnType<typeof createAdminClient>,
  params: {
    merchantId: string;
    conversationId: string;
    messageId: string;
    inputHash: string;
    decisionCase:
      | "ai_unavailable"
      | "intent_other"
      | "question_answered"
      | "question_flagged"
      | "order_collecting"
      | "order_ready_to_confirm"
      | "order_confirmed"
      | "order_cancelled_by_customer";
    geminiConfidence: number | null;
    orderId?: string | null;
    validationDiagnostics?: ValidationDiagnostics | null;
  }
): Promise<void> {
  try {
    const { error } = await supabase.from("ai_decisions").insert({
      merchant_id: params.merchantId,
      conversation_id: params.conversationId,
      message_id: params.messageId,
      order_id: params.orderId ?? null,
      model_version: AI_CONFIG.model,
      prompt_version: AI_CONFIG.promptVersion,
      input_hash: params.inputHash,
      gemini_confidence: params.geminiConfidence,
      // Equals the raw model score today; reserved for deterministic re-scoring.
      effective_confidence: params.geminiConfidence,
      decision_case: params.decisionCase,
      validation_diagnostics: params.validationDiagnostics ?? null,
    });
    if (error) {
      console.error(
        `[AI Pipeline] recordDecision | insert failed (${params.decisionCase}): ${error.message}`
      );
    }
  } catch (err) {
    console.error(
      `[AI Pipeline] recordDecision | unexpected error (${params.decisionCase}):`,
      err
    );
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
 * Raise ONE merchant-visible flag when deterministic validation found stock
 * shortfalls and/or unrecognized variants on an order's items. Non-blocking:
 * the order is already created ("AI suggests, the merchant decides") — this
 * just surfaces what needs reconciling.
 *
 *   - Stock shortfalls present → category `out_of_stock`, priority `medium`.
 *   - Variant-only issues      → category `ai_low_confidence`, priority `low`.
 *
 * No-op when both arrays are empty (keeps the 3 order-creating call sites clean,
 * mirroring flagInvalidProducts).
 */
async function flagStockAndVariantIssues(
  supabase: ReturnType<typeof createAdminClient>,
  params: {
    merchantId: string;
    orderId: string;
    conversationId: string;
    messageId: string;
    outOfStockItems: string[];
    invalidVariants: string[];
  }
): Promise<void> {
  const {
    merchantId,
    orderId,
    conversationId,
    messageId,
    outOfStockItems,
    invalidVariants,
  } = params;
  if (outOfStockItems.length === 0 && invalidVariants.length === 0) return;

  const hasStockIssue = outOfStockItems.length > 0;
  const parts: string[] = [];
  if (outOfStockItems.length > 0) {
    parts.push(`Insufficient stock — ${outOfStockItems.join("; ")}`);
  }
  if (invalidVariants.length > 0) {
    parts.push(`Unrecognized variant(s) — ${invalidVariants.join("; ")}`);
  }

  console.log(
    `[AI Pipeline] ${messageId.slice(0, 8)} | stock/variant issues (${outOfStockItems.length} stock, ${invalidVariants.length} variant) → flag`
  );
  await supabase.from("flags").insert({
    merchant_id: merchantId,
    order_id: orderId,
    conversation_id: conversationId,
    message_id: messageId,
    priority: hasStockIssue ? "medium" : "low",
    category: hasStockIssue ? "out_of_stock" : "ai_low_confidence",
    title: hasStockIssue
      ? "Order exceeds available stock"
      : "AI matched an unavailable variant",
    description: parts.join(". "),
    recommended_action:
      "Review the order items against current stock and offered variants before confirming with the customer.",
  });
}

/**
 * Raise a merchant-visible flag when the model signals a genuine escalation
 * (needs_human). Fire-and-forget in spirit — layered alongside the handoff
 * message so the merchant sees the customer explicitly wants a person.
 */
async function raiseHandoffFlag(
  supabase: ReturnType<typeof createAdminClient>,
  params: {
    merchantId: string;
    conversationId: string;
    messageId: string;
    takeoverReason?: "customer_requested" | "ai_escalation";
  }
): Promise<void> {
  const { merchantId, conversationId, messageId } = params;
  console.log(`[AI Pipeline] ${messageId.slice(0, 8)} | escalation → handoff + flag`);
  await supabase.from("flags").insert({
    merchant_id: merchantId,
    conversation_id: conversationId,
    message_id: messageId,
    priority: "medium",
    category: "human_requested",
    title: "Customer asked for a human",
    description:
      "The AI escalated this conversation — the customer explicitly asked for a person or the request is out of scope. A handoff message was sent.",
    recommended_action: "Take over the conversation and assist the customer.",
  });
  await enterHumanTakeover(supabase, {
    merchantId,
    conversationId,
    reason: params.takeoverReason ?? "ai_escalation",
  });
}

/**
 * Whether the model's reply already states the real available amount for every
 * stock shortfall — a cheap heuristic (does the reply contain each available
 * quantity as text?). When false, the pipeline overrides the reply with a
 * deterministic availability notice so the customer is always told the truth.
 */
function replyStatesShortfalls(
  reply: string | null,
  shortfalls: StockShortfall[]
): boolean {
  if (!reply) return false;
  return shortfalls.every((s) => reply.includes(String(s.available)));
}

/**
 * Deterministic, truthful availability notice naming each product and the exact
 * amount on hand — used when the model failed to surface a stock shortfall.
 */
function buildStockShortfallReply(
  shortfalls: StockShortfall[],
  language: "ar" | "en"
): string {
  if (language === "ar") {
    return shortfalls
      .map(
        (s) =>
          `المتوفر حالياً من ${s.productName} هو ${s.available} فقط. هل يناسبك هذا العدد أم تفضل شيئاً آخر؟`
      )
      .join(" ");
  }
  return shortfalls
    .map(
      (s) =>
        `Sorry, we only have ${s.available} of ${s.productName} right now. Would you like that amount, or something else?`
    )
    .join(" ");
}

function resolveReplyLanguage(
  configured: string,
  currentMessage: string
): "ar" | "en" {
  if (configured === "ar" || configured === "en") return configured;
  return /[\u0600-\u06ff]/.test(currentMessage) ? "ar" : "en";
}

function localizedOrderPlaced(language: "ar" | "en"): string {
  return language === "ar" ? "تم تأكيد طلبك ✅" : "Your order is confirmed ✅";
}

function buildConfirmationReadback(
  items: Array<{
    product_name: string;
    variant: string | null;
    quantity: number;
  }>,
  deliveryAddress: string | null,
  total: number,
  currency: string,
  language: "ar" | "en"
): string {
  const itemText = items
    .map((item) => {
      const variant = item.variant ? ` (${item.variant})` : "";
      return `${item.quantity}× ${item.product_name}${variant}`;
    })
    .join(language === "ar" ? "، " : ", ");
  const address = deliveryAddress ?? (language === "ar" ? "غير محدد" : "not provided");

  return language === "ar"
    ? `للتأكيد: ${itemText}. المجموع ${total} ${currency}، والتوصيل إلى ${address}. هل أؤكد الطلب؟`
    : `To confirm: ${itemText}. Total ${total} ${currency}, delivered to ${address}. Shall I place the order?`;
}

async function persistGroundedCustomerProfile(
  supabase: ReturnType<typeof createAdminClient>,
  params: {
    merchantId: string;
    customerId: string;
    currentMessage: string;
    existing: {
      name: string | null;
      phone: string | null;
      deliveryAddress: string | null;
    };
    proposed: {
      name?: string | null;
      phone?: string | null;
      delivery_address?: string | null;
    };
  }
): Promise<void> {
  const update: Record<string, string> = {};
  if (
    params.proposed.name !== params.existing.name &&
    isGroundedProfileValue(params.proposed.name, params.currentMessage)
  ) {
    update.name = params.proposed.name;
  }
  if (
    params.proposed.phone !== params.existing.phone &&
    isGroundedProfileValue(params.proposed.phone, params.currentMessage)
  ) {
    update.phone = params.proposed.phone;
  }
  if (
    params.proposed.delivery_address !== params.existing.deliveryAddress &&
    isGroundedProfileValue(
      params.proposed.delivery_address,
      params.currentMessage
    )
  ) {
    update.delivery_address = params.proposed.delivery_address;
  }
  if (Object.keys(update).length === 0) return;

  const { error } = await supabase
    .from("customers")
    .update(update)
    .eq("id", params.customerId)
    .eq("merchant_id", params.merchantId);
  if (error) {
    console.error(`[AI Pipeline] customer profile update failed: ${error.message}`);
  }
}

// --- Circuit breaker helpers ---
// All wrapped so a breaker failure only logs and never throws into the pipeline,
// consistent with the fire-and-forget audit pattern (recordDecision).

interface BreakerState {
  status: "active" | "paused";
  pausedAt: string | null;
}

/**
 * Read the merchant's breaker state (ai_status / ai_paused_at). Never throws —
 * on any error it returns `active`, so a read failure fails OPEN (Gemini still
 * runs) rather than wedging the merchant.
 */
async function readBreakerState(
  supabase: ReturnType<typeof createAdminClient>,
  merchantId: string
): Promise<BreakerState> {
  try {
    const { data, error } = await supabase
      .from("merchant_settings")
      .select("ai_status, ai_paused_at")
      .eq("merchant_id", merchantId)
      .maybeSingle();
    if (error) {
      console.error(`[AI Pipeline] breaker | read failed: ${error.message}`);
      return { status: "active", pausedAt: null };
    }
    return {
      status: data?.ai_status === "paused" ? "paused" : "active",
      pausedAt: data?.ai_paused_at ?? null,
    };
  } catch (err) {
    console.error(`[AI Pipeline] breaker | read error:`, err);
    return { status: "active", pausedAt: null };
  }
}

/**
 * After an ai_unavailable failure, count recent ai_unavailable flags for this
 * merchant within AI_FAILURE_WINDOW_MS and TRIP the breaker (ai_status=paused,
 * ai_paused_at=now) if the threshold is met. Never throws.
 */
async function maybeTripBreaker(
  supabase: ReturnType<typeof createAdminClient>,
  merchantId: string,
  tag: string
): Promise<void> {
  try {
    const windowStart = new Date(Date.now() - AI_FAILURE_WINDOW_MS).toISOString();
    const { count, error } = await supabase
      .from("flags")
      .select("id", { count: "exact", head: true })
      .eq("merchant_id", merchantId)
      .eq("category", "ai_unavailable")
      .gte("created_at", windowStart);
    if (error) {
      console.error(
        `[AI Pipeline] breaker | failure count failed: ${error.message}`
      );
      return;
    }
    if ((count ?? 0) >= AI_FAILURE_THRESHOLD) {
      const { error: updateError } = await supabase
        .from("merchant_settings")
        .update({ ai_status: "paused", ai_paused_at: new Date().toISOString() })
        .eq("merchant_id", merchantId);
      if (updateError) {
        console.error(
          `[AI Pipeline] breaker | trip update failed: ${updateError.message}`
        );
        return;
      }
      console.log(
        `${tag} | breaker | TRIPPED — ${count} ai_unavailable failure(s) in window → paused`
      );
    }
  } catch (err) {
    console.error(`[AI Pipeline] breaker | trip error:`, err);
  }
}

/**
 * Reset the breaker to active after a successful half-open probe. Never throws.
 */
async function resetBreaker(
  supabase: ReturnType<typeof createAdminClient>,
  merchantId: string
): Promise<void> {
  try {
    const { error } = await supabase
      .from("merchant_settings")
      .update({ ai_status: "active", ai_paused_at: null })
      .eq("merchant_id", merchantId);
    if (error) {
      console.error(`[AI Pipeline] breaker | reset failed: ${error.message}`);
    }
  } catch (err) {
    console.error(`[AI Pipeline] breaker | reset error:`, err);
  }
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
  text: string,
  options: { allowDuringTakeover?: boolean } = {}
): Promise<void> {
  if (!options.allowDuringTakeover) {
    // Re-check immediately before the external send to close the race where a
    // merchant takes over while a model call is still in flight.
    const { data: control, error } = await supabase
      .from("conversations")
      .select("automation_mode")
      .eq("id", conversationId)
      .eq("merchant_id", merchantId)
      .single();
    if (error || control?.automation_mode !== "ai") {
      console.log(
        "[AI Pipeline] sendAI | skipped because human takeover is active or unverifiable"
      );
      return;
    }
  }
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
