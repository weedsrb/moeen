import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("AI worker cutover contract", () => {
  const migration = readFileSync(
    join(
      process.cwd(),
      "supabase",
      "migrations",
      "037_ai_worker_cutover.sql"
    ),
    "utf8"
  );
  const worker = readFileSync(
    join(process.cwd(), "src", "worker", "index.ts"),
    "utf8"
  );
  const script = readFileSync(
    join(process.cwd(), "infra", "n8n", "scripts", "cutover-ai.sh"),
    "utf8"
  );

  it("accepts the worker's superseded terminal state", () => {
    expect(migration).toContain("'superseded', 'dead_letter'");
    expect(migration).toContain(
      "p_status NOT IN ('completed', 'skipped', 'superseded')"
    );
  });

  it("allows only the service role to inspect or change the runtime switch", () => {
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION set_ai_execution_backend(text, text)"
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION set_ai_execution_backend(text, text)"
    );
    expect(migration).toContain("TO service_role");
    expect(migration).not.toMatch(
      /GRANT EXECUTE ON FUNCTION set_ai_execution_backend[\s\S]{0,100}TO (?:anon|authenticated)/
    );
  });

  it("refuses queue activation without fresh worker coverage", () => {
    expect(migration).toContain("v_healthy_count < v_merchant_count");
    expect(migration).toContain("interval '60 seconds'");
  });

  it("stops claiming jobs when the runtime switch is inline", () => {
    expect(worker).toContain("getAIExecutionBackend");
    expect(worker).toContain("if (!(await canConsumeQueue()))");
  });

  it("requires an explicit one-command confirmation for cutover and rollback", () => {
    expect(script).toContain('AI_CUTOVER_CONFIRM:-');
    expect(script).toContain("rpc set_ai_execution_backend");
    expect(script).not.toContain("SUPABASE_SERVICE_ROLE_KEY=");
  });
});

