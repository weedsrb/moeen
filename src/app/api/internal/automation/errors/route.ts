import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { createAdminClient } from "@/lib/supabase/admin";
import { readAuthenticatedAutomationRequest } from "@/lib/automation/request";
import { automationWorkflowTypes } from "@/lib/automation/types";

const errorSchema = z.object({
  job_id: z.string().uuid().nullable().optional(),
  workflow_type: z.enum(automationWorkflowTypes),
  execution_id: z.string().max(200).nullable().optional(),
  error_class: z.string().min(1).max(100),
  error_message: z.string().max(500).nullable().optional(),
});

export async function POST(request: NextRequest) {
  const authenticated = await readAuthenticatedAutomationRequest(request);
  if ("error" in authenticated) return authenticated.error;
  const parsed = errorSchema.safeParse(authenticated.body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid error report" }, { status: 400 });
  }
  const supabase = createAdminClient();
  let merchantId: string | null = null;
  if (parsed.data.job_id) {
    const { data: job } = await supabase
      .from("automation_jobs")
      .select("merchant_id")
      .eq("id", parsed.data.job_id)
      .maybeSingle();
    merchantId = job?.merchant_id ?? null;
  }
  const { error } = await supabase.from("automation_workflow_errors").insert({
    merchant_id: merchantId,
    automation_job_id: parsed.data.job_id ?? null,
    workflow_type: parsed.data.workflow_type,
    execution_id: parsed.data.execution_id ?? null,
    error_class: parsed.data.error_class,
    error_message: parsed.data.error_message ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ recorded: true });
}
