import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { createAdminClient } from "@/lib/supabase/admin";
import { readAuthenticatedAutomationRequest } from "@/lib/automation/request";

const completeSchema = z.object({ provider_message_id: z.string().max(200).nullable().optional() });

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const authenticated = await readAuthenticatedAutomationRequest(request);
  if ("error" in authenticated) return authenticated.error;
  const parsed = completeSchema.safeParse(authenticated.body);
  const { id } = await context.params;
  if (!parsed.success || !z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid completion request" }, { status: 400 });
  }
  const { data, error } = await createAdminClient().rpc("complete_automation_job", {
    p_job_id: id,
    p_provider_message_id: parsed.data.provider_message_id ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ completed: Boolean(data) });
}
