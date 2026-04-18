import { Skeleton } from "@/components/ui/skeleton";

export default function InventoryLoading() {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-visible space-y-6">
      <Skeleton variant="shimmer" className="h-8 w-32" />
      {/* Toolbar skeleton */}
      <div className="flex items-center gap-3">
        <Skeleton variant="shimmer" className="h-9 flex-1 max-w-xs rounded-md" />
        <Skeleton variant="shimmer" className="h-9 w-28 rounded-md" />
        <Skeleton variant="shimmer" className="h-9 w-28 rounded-md" />
        <Skeleton variant="shimmer" className="h-9 w-9 rounded-md" />
        <Skeleton variant="shimmer" className="h-9 w-32 rounded-md" />
      </div>
      {/* Product grid skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card overflow-hidden">
            <Skeleton variant="shimmer" className="h-40 w-full" />
            <div className="p-4 space-y-2">
              <Skeleton variant="shimmer" className="h-5 w-32" />
              <Skeleton variant="shimmer" className="h-4 w-20" />
              <Skeleton variant="shimmer" className="h-2 w-full rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
