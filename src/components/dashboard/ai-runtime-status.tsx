import { AlertTriangle, Bot, CircleCheck, Server } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface AIRuntimeStatusProps {
  aiStatus: "active" | "paused";
  workerStatus: "not_configured" | "healthy" | "degraded" | "offline";
  queueDepth: number;
  oldestMessageAgeSeconds: number | null;
}

export function AIRuntimeStatus({
  aiStatus,
  workerStatus,
  queueDepth,
  oldestMessageAgeSeconds,
}: AIRuntimeStatusProps) {
  const aiPaused = aiStatus === "paused";
  const queueProblem =
    workerStatus === "degraded" || workerStatus === "offline";

  if (!aiPaused && !queueProblem && workerStatus === "not_configured")
    return null;

  return (
    <Card className={aiPaused || queueProblem ? "border-amber-500/40" : undefined}>
      <CardContent className="grid gap-3 py-4 sm:grid-cols-2">
        <div className="flex items-center gap-3">
          {aiPaused ? (
            <AlertTriangle className="h-5 w-5 text-amber-500" />
          ) : (
            <CircleCheck className="h-5 w-5 text-emerald-500" />
          )}
          <div>
            <p className="text-sm font-medium">AI replies</p>
            <p className="text-xs text-muted-foreground">
              {aiPaused ? "Paused after repeated provider failures" : "Active"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {workerStatus === "healthy" ? (
            <Server className="h-5 w-5 text-emerald-500" />
          ) : (
            <Bot className="h-5 w-5 text-muted-foreground" />
          )}
          <div>
            <p className="text-sm font-medium">AI queue</p>
            <p className="text-xs text-muted-foreground">
              {workerStatus.replace("_", " ")} · {queueDepth} pending
              {oldestMessageAgeSeconds !== null
                ? ` · oldest ${oldestMessageAgeSeconds}s`
                : ""}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
