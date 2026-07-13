import type { SupabaseClient } from "@supabase/supabase-js";
import type { AutomationWorkflowType } from "./types";

export interface ScheduleResult {
  workflowType: AutomationWorkflowType;
  scanned: number;
  notificationsUpserted: number;
  jobsUpserted: number;
  dryRun: boolean;
}

export async function runAutomationSchedule(
  _supabase: SupabaseClient,
  workflowType: AutomationWorkflowType,
  dryRun: boolean
): Promise<ScheduleResult> {
  if (workflowType === "new-order-alerts") {
    // New-order alerts are transaction-triggered when the order timeline records
    // collecting → incoming. The schedule endpoint remains a cheap health/poll
    // boundary before n8n claims the resulting email outbox jobs.
    return {
      workflowType,
      scanned: 0,
      notificationsUpserted: 0,
      jobsUpserted: 0,
      dryRun,
    };
  }
  throw new Error(`Schedule not implemented yet: ${workflowType}`);
}
