import { Skeleton } from "@/components/ui/skeleton";

export default function AppLoading() {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-visible space-y-6 p-4 sm:p-6">
      <Skeleton variant="shimmer" className="h-8 w-40" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton variant="shimmer" key={i} className="h-24 rounded-lg" />
        ))}
      </div>
      <Skeleton variant="shimmer" className="h-40 rounded-lg" />
      <Skeleton variant="shimmer" className="h-32 rounded-lg" />
    </div>
  );
}
