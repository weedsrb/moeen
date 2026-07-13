import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { createAdminClient } from "@/lib/supabase/admin";
import { readAuthenticatedAutomationRequest } from "@/lib/automation/request";
import { automationWorkflowTypes } from "@/lib/automation/types";

const claimSchema = z.object({
  workflow_type: z.enum(automationWorkflowTypes),
  limit: z.number().int().min(1).max(50).default(10),
  lease_seconds: z.number().int().min(30).max(600).default(120),
});

export async function POST(request: NextRequest) {
  const authenticated = await readAuthenticatedAutomationRequest(request);
  if ("error" in authenticated) return authenticated.error;
  const parsed = claimSchema.safeParse(authenticated.body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid claim request" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const usageDate = new Date().toISOString().slice(0, 10);
  const { data: usage } = await supabase
    .from("automation_email_usage")
    .select("sent_count")
    .eq("usage_date", usageDate);
  const globalSent = (usage ?? []).reduce(
    (total, row) => total + (row.sent_count ?? 0),
    0
  );
  const dailyLimit = Math.max(
    1,
    Number(process.env.AUTOMATION_EMAIL_DAILY_LIMIT ?? 90)
  );
  if (globalSent >= dailyLimit) {
    return NextResponse.json({ jobs: [], email_quota: "deferred" });
  }

  const { data, error } = await supabase.rpc("claim_automation_jobs", {
    p_workflow_type: parsed.data.workflow_type,
    p_limit: Math.min(parsed.data.limit, dailyLimit - globalSent),
    p_lease_seconds: parsed.data.lease_seconds,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ jobs: data ?? [], email_quota: "available" });
}
