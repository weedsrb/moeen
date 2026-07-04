"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { useFlagsSummarySetter } from "@/components/layout/flags-count-provider";
import { highestPriority } from "@/lib/utils/flags";
import type { Flag } from "@/types/flag";

type Action = { type: "resolve"; id: string };

interface FlagsListProps {
  initialFlags: Flag[];
}

export function FlagsList({ initialFlags }: FlagsListProps) {
  const router = useRouter();
  const setFlagsSummary = useFlagsSummarySetter();
  const [isPending, startTransition] = useTransition();
  const [errorId, setErrorId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const [flags, applyOptimistic] = useOptimistic<Flag[], Action>(
    initialFlags,
    (state, action) =>
      action.type === "resolve" ? state.filter((f) => f.id !== action.id) : state,
  );

  function resolve(id: string) {
    setErrorId(null);
    setPendingId(id);

    // Optimistically shrink the sidebar Flags badge immediately (realtime
    // reconciles once the resolve UPDATE lands).
    const remaining = flags.filter((f) => f.id !== id);
    setFlagsSummary({
      count: remaining.length,
      highestPriority: highestPriority(remaining.map((f) => f.priority)),
    });

    startTransition(async () => {
      applyOptimistic({ type: "resolve", id });
      const res = await fetch(`/api/flags/${id}/resolve`, { method: "POST" });
      if (!res.ok) {
        setErrorId(id);
        setPendingId(null);
        // Roll the badge back to the full open set on failure.
        setFlagsSummary({
          count: flags.length,
          highestPriority: highestPriority(flags.map((f) => f.priority)),
        });
        return;
      }
      setPendingId(null);
      router.refresh();
    });
  }

  const critical = flags.filter((f) => f.priority === "critical");
  const medium = flags.filter((f) => f.priority === "medium");
  const low = flags.filter((f) => f.priority === "low");

  const sections: {
    title: string;
    color: string;
    badgeColor: string;
    flags: Flag[];
  }[] = [
    {
      title: "Critical",
      color: "text-red-500",
      badgeColor: "bg-red-500/10 text-red-500",
      flags: critical,
    },
    {
      title: "Medium",
      color: "text-amber-500",
      badgeColor: "bg-amber-500/10 text-amber-500",
      flags: medium,
    },
    {
      title: "Low",
      color: "text-muted-foreground",
      badgeColor: "bg-muted",
      flags: low,
    },
  ];

  return (
    <>
      {sections.map((section) =>
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
              {section.flags.map((flag) => {
                const isResolving = pendingId === flag.id && isPending;
                const hasError = errorId === flag.id;
                return (
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
                        {flag.category} ·{" "}
                        {new Date(flag.created_at).toLocaleString()}
                      </p>
                      {hasError && (
                        <p className="text-xs text-red-500 mt-2">
                          Couldn&apos;t resolve — try again.
                        </p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => resolve(flag.id)}
                      disabled={isResolving}
                      className="shrink-0"
                    >
                      {isResolving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Check className="me-1 h-4 w-4" />
                          Resolve
                        </>
                      )}
                    </Button>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ) : null,
      )}
    </>
  );
}
