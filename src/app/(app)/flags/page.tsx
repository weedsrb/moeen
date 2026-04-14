import { PageTransition } from "@/components/layout/page-transition";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { FlagPriority } from "@/types/flag";

export default async function FlagsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: merchant } = await supabase
    .from("merchants")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!merchant) redirect("/onboarding");

  const { data: flags } = await supabase
    .from("flags")
    .select("*")
    .eq("merchant_id", merchant.id)
    .eq("is_resolved", false)
    .order("created_at", { ascending: false });

  const allFlags = flags ?? [];
  const critical = allFlags.filter((f) => f.priority === "critical");
  const medium = allFlags.filter((f) => f.priority === "medium");
  const low = allFlags.filter((f) => f.priority === "low");

  const sections: {
    title: string;
    color: string;
    badgeColor: string;
    flags: typeof allFlags;
  }[] = [
    { title: "Critical", color: "text-red-500", badgeColor: "bg-red-500/10 text-red-500", flags: critical },
    { title: "Medium", color: "text-amber-500", badgeColor: "bg-amber-500/10 text-amber-500", flags: medium },
    { title: "Low", color: "text-muted-foreground", badgeColor: "bg-muted", flags: low },
  ];

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
          sections.map((section) =>
            section.flags.length > 0 ? (
              <Card key={section.title}>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <CardTitle className={`text-lg ${section.color}`}>
                      {section.title}
                    </CardTitle>
                    <Badge className={section.badgeColor}>
                      {section.flags.length}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {section.flags.map((flag) => (
                    <div
                      key={flag.id}
                      className="flex items-start gap-3 rounded-md border border-border p-3"
                    >
                      <AlertTriangle
                        className={`h-4 w-4 mt-0.5 shrink-0 ${section.color}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{flag.title}</p>
                        {flag.description && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {flag.description}
                          </p>
                        )}
                        {flag.recommended_action && (
                          <p className="text-xs text-muted-foreground/70 mt-1 italic">
                            {flag.recommended_action}
                          </p>
                        )}
                        <p className="text-[10px] text-muted-foreground/50 font-mono mt-2">
                          {flag.category} · {new Date(flag.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null
          )
        )}
      </div>
    </PageTransition>
  );
}
