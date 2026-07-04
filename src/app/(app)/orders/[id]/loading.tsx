import { Skeleton } from "@/components/ui/skeleton";

export default function OrderDetailLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <Skeleton variant="shimmer" className="h-8 w-44" />
      <div className="hidden min-h-0 flex-1 gap-4 md:flex">
        <Skeleton variant="shimmer" className="basis-[40%] rounded-lg" />
        <Skeleton variant="shimmer" className="flex-1 rounded-lg" />
      </div>
      <div className="space-y-3 md:hidden">
        <Skeleton variant="shimmer" className="h-8 w-full" />
        <Skeleton variant="shimmer" className="h-96 w-full rounded-lg" />
      </div>
    </div>
  );
}
