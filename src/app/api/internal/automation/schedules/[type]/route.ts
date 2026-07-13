import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { createAdminClient } from "@/lib/supabase/admin";
import { readAuthenticatedAutomationRequest } from "@/lib/automation/request";
import { runAutomationSchedule } from "@/lib/automation/schedules";
import { isAutomationWorkflowType } from "@/lib/automation/types";

const scheduleBodySchema = z.object({ dry_run: z.boolean().optional() });

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ type: string }> }
) {
  const authenticated = await readAuthenticatedAutomationRequest(request);
  if ("error" in authenticated) return authenticated.error;
  const parsed = scheduleBodySchema.safeParse(authenticated.body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid schedule request" }, { status: 400 });
  }
  const { type } = await context.params;
  if (!isAutomationWorkflowType(type)) {
    return NextResponse.json({ error: "Unknown workflow type" }, { status: 404 });
  }
  try {
    const result = await runAutomationSchedule(
      createAdminClient(),
      type,
      parsed.data.dry_run ?? false
    );
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Schedule failed" },
      { status: 500 }
    );
  }
}
