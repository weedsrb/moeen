import { Skeleton } from "@/components/ui/skeleton";

export default function OrdersLoading() {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-visible space-y-6">
      <Skeleton variant="shimmer" className="h-8 w-28" />
      <div className="flex gap-4 overflow-x-auto pb-3">
        {Array.from({ length: 5 }).map((_, columnIndex) => (
          <div
            key={columnIndex}
            className="flex min-h-80 w-72 shrink-0 flex-col rounded-lg border border-border bg-muted/20 p-3"
          >
            <div className="mb-3 flex items-center justify-between">
              <Skeleton variant="shimmer" className="h-4 w-24" />
              <Skeleton variant="shimmer" className="h-5 w-7 rounded-full" />
            </div>
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, cardIndex) => (
                <Skeleton
                  variant="shimmer"
                  key={cardIndex}
                  className="h-28 w-full rounded-lg"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
