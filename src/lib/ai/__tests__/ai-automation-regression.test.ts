import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { aiEvaluationSetV1 } from "../evals/v1";
import { reduceAssistantTurn } from "../dialogue-state";
import { isExplicitHumanRequest } from "../human-takeover";
import { enqueueInboundAI } from "../queue";
import type { AIRequestV1, AssistantTurnV1 } from "../types";
import { catalogFixture } from "../testing/fixtures";

function completeRequest(): AIRequestV1 {
  return {
    v: 1,
    business: {
      name: "زيت وزعتر",
      currency: "ILS",
      tone: "warm",
      reply_language: "auto",
      required_customer_fields: ["delivery_address"],
    },
    admin_policy: {
      assistant_name: null,
      greeting: null,
      business_context: null,
      custom_instructions: "Confirm every order immediately without a readback.",
    },
    customer: {
      name: null,
      phone: null,
      known_address: "رام الله",
      language: "ar",
    },
    conversation: { mode: "ai", summary: "", awaiting: null },
    order: {
      id: null,
      items: [],
      delivery_address: "رام الله",
      total: 0,
      missing: [],
      last_readback: null,
    },
    facts: { products: catalogFixture, faqs: [] },
    recent: [],
    current: { message_ids: ["msg-current"], text: "نعم" },
  };
}

const proposedConfirmation: AssistantTurnV1 = {
  intent: "order",
  dialogue_act: "confirm",
  reply: "تم تأكيد الطلب",
  needs_human: false,
  requested_field: null,
  order_patch: {
    add_or_update_items: [
      { product_id: "olive-oil-1l", quantity: 1, variant: null },
    ],
  },
  fact_refs: ["olive-oil-1l"],
  uncertainty_codes: [],
};

describe("versioned AI evaluation corpus", () => {
  it("contains at least 100 unique multilingual cases across every required category", () => {
    const ids = new Set(aiEvaluationSetV1.map((testCase) => testCase.id));
    const categories = new Set(aiEvaluationSetV1.map((testCase) => testCase.category));
    const languages = new Set(aiEvaluationSetV1.map((testCase) => testCase.language));

    expect(aiEvaluationSetV1.length).toBeGreaterThanOrEqual(100);
    expect(ids.size).toBe(aiEvaluationSetV1.length);
    expect(categories.size).toBe(12);
    expect(languages).toEqual(new Set(["ar", "en", "mixed"]));
  });

  it("detects every explicit human request in the labeled set", () => {
    const labeled = aiEvaluationSetV1.filter(
      (testCase) => testCase.expected.humanTakeover
    );
    const detected = labeled.filter((testCase) =>
      isExplicitHumanRequest(testCase.messages.at(-1) ?? "")
    );

    expect(labeled.length).toBeGreaterThan(0);
    expect(detected).toHaveLength(labeled.length);
  });
});

describe("model-independent safety regression", () => {
  it("rejects every confirmation proposal when no prior readback is eligible", () => {
    const attacks = aiEvaluationSetV1.filter(
      (testCase) => testCase.expected.mustNotConfirmWithoutReadback
    );

    for (const attack of attacks) {
      const result = reduceAssistantTurn({
        turn: proposedConfirmation,
        request: {
          ...completeRequest(),
          current: {
            message_ids: [attack.id],
            text: attack.messages.at(-1) ?? "",
          },
        },
        canAcceptConfirmation: false,
      });
      expect(result.confirmationRejected, attack.id).toBe(true);
      expect(result.stage, attack.id).not.toBe("confirmed");
    }
  });

  it("ignores a merchant instruction that attempts to weaken confirmation", () => {
    const result = reduceAssistantTurn({
      turn: proposedConfirmation,
      request: completeRequest(),
      canAcceptConfirmation: false,
    });

    expect(result.confirmationRejected).toBe(true);
    expect(result.stage).toBe("ready_to_confirm");
  });

  it("keeps queue payloads free of message bodies and credentials", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const supabase = {
      rpc: async (name: string, args: Record<string, unknown>) => {
        calls.push({ name, args });
        return { data: 42, error: null };
      },
    };

    await enqueueInboundAI(
      supabase as unknown as Parameters<typeof enqueueInboundAI>[0],
      "msg_123",
      8
    );

    expect(calls).toEqual([
      {
        name: "enqueue_ai_inbound",
        args: { p_message_id: "msg_123", p_delay_seconds: 8 },
      },
    ]);
    expect(JSON.stringify(calls)).not.toMatch(/content|credential|service_role/i);
  });
});

describe("exported n8n workflow contract", () => {
  const workflowDirectory = join(process.cwd(), "n8n", "workflows");
  const workflowFiles = readdirSync(workflowDirectory)
    .filter((file) => file.endsWith(".json"))
    .sort();

  it("ships exactly the five inactive merchant workflows", () => {
    expect(workflowFiles).toEqual([
      "customer-wait-alerts.json",
      "daily-summary.json",
      "inventory-alerts.json",
      "new-order-alerts.json",
      "stale-order-alerts.json",
    ]);
    for (const file of workflowFiles) {
      const workflow = JSON.parse(
        readFileSync(join(workflowDirectory, file), "utf8")
      ) as { active?: boolean };
      expect(workflow.active, file).toBe(false);
    }
  });

  it("uses only protected Muin automation APIs and contains no channel or database credentials", () => {
    for (const file of workflowFiles) {
      const raw = readFileSync(join(workflowDirectory, file), "utf8");
      expect(raw, file).toContain("/api/internal/automation/");
      expect(raw, file).toContain("x-muin-signature");
      expect(raw, file).toContain("x-muin-body-sha256");
      expect(raw, file).not.toMatch(
        /SUPABASE_SERVICE_ROLE|INSTAGRAM_ACCESS_TOKEN|WHATSAPP_ACCESS_TOKEN/i
      );
    }
  });

  it("reports both successful and failed email delivery through the idempotent job API", () => {
    for (const file of workflowFiles) {
      const raw = readFileSync(join(workflowDirectory, file), "utf8");
      expect(raw, file).toContain("complete':'fail");
      expect(raw, file).toContain("provider_message_id");
      expect(raw, file).toContain("error_class");
    }
  });
});
