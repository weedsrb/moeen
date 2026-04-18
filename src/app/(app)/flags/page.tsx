import { PageTransition } from "@/components/layout/page-transition";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2 } from "lucide-react";
import { FLAG_COLUMNS } from "@/lib/db/columns";
import { requireMerchant } from "@/lib/auth/require-merchant";
import { FlagsList } from "@/components/flags/flags-list";
import type { Flag } from "@/types/flag";

export default async function FlagsPage() {
  const { merchant } = await requireMerchant();
  const supabase = await createClient();

  const { data: flags } = await supabase
    .from("flags")
    .select(FLAG_COLUMNS)
    .eq("merchant_id", merchant.id)
    .eq("is_resolved", false)
    .order("created_at", { ascending: false });

  const allFlags = (flags ?? []) as Flag[];

  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Flags &amp; Escalations</h1>
          {allFlags.length > 0 && (
            <Badge variant="outline" className="font-mono">
              {allFlags.length} open
            </Badge>
          )}
        </div>

        {allFlags.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500/50" />
            <h2 className="mt-4 text-lg font-medium">All clear</h2>
            <p className="mt-1 text-sm text-muted-foreground max-w-sm">
              No flags or escalations need your attention right now.
            </p>
          </div>
        ) : (
          <FlagsList initialFlags={allFlags} />
        )}
      </div>
    </PageTransition>
  );
}
