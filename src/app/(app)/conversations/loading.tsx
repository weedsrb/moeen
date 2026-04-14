import { Skeleton } from "@/components/ui/skeleton";

export default function ConversationsLoading() {
  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4">
      <Skeleton className="h-8 w-36 shrink-0" />
      <div className="flex flex-1 min-h-0 rounded-lg border border-border overflow-hidden bg-card">
        {/* Conversation list skeleton */}
        <div className="w-full sm:w-80 sm:border-ie border-border shrink-0 p-3 space-y-3">
          <Skeleton className="h-9 w-full rounded-md" />
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-2">
              <Skeleton className="h-10 w-10 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-40" />
              </div>
            </div>
          ))}
        </div>
        {/* Chat panel skeleton */}
        <div className="flex-1 hidden sm:flex flex-col items-center justify-center">
          <Skeleton className="h-5 w-56" />
        </div>
      </div>
    </div>
  );
}
