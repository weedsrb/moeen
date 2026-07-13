import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { createAdminClient } from "@/lib/supabase/admin";
import { readAuthenticatedAutomationRequest } from "@/lib/automation/request";

const failSchema = z.object({
  error_class: z.string().min(1).max(100),
  error_message: z.string().max(500).nullable().optional(),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const authenticated = await readAuthenticatedAutomationRequest(request);
  if ("error" in authenticated) return authenticated.error;
  const parsed = failSchema.safeParse(authenticated.body);
  const { id } = await context.params;
  if (!parsed.success || !z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid failure request" }, { status: 400 });
  }
  const { data, error } = await createAdminClient().rpc("fail_automation_job", {
    p_job_id: id,
    p_error_class: parsed.data.error_class,
    p_error_message: parsed.data.error_message ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ status: data });
}
