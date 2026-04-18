import { Skeleton } from "@/components/ui/skeleton";

export default function OrdersLoading() {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-visible space-y-6">
      <Skeleton variant="shimmer" className="h-8 w-28" />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton variant="shimmer" key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
