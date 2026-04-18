import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function InventoryDetailLoading() {
  return (
    <div className="page-fade flex-1 min-h-0 overflow-y-auto px-1">
      <div className="space-y-6">
        {/* Header: back link + actions */}
        <div className="flex items-center justify-between">
          <Skeleton variant="shimmer" className="h-5 w-36" />
          <div className="flex gap-2">
            <Skeleton variant="shimmer" className="h-9 w-20 rounded-md" />
            <Skeleton variant="shimmer" className="h-9 w-28 rounded-md" />
          </div>
        </div>

        {/* Product info: image + details */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton variant="shimmer" className="aspect-square rounded-lg" />
          <div className="md:col-span-2 space-y-4">
            <div className="space-y-2">
              <Skeleton variant="shimmer" className="h-7 w-64" />
              <Skeleton variant="shimmer" className="h-8 w-28" />
            </div>
            <div className="space-y-2">
              <Skeleton variant="shimmer" className="h-3 w-32" />
              <div className="flex gap-2">
                <Skeleton variant="shimmer" className="h-6 w-16 rounded-full" />
                <Skeleton variant="shimmer" className="h-6 w-20 rounded-full" />
                <Skeleton variant="shimmer" className="h-6 w-14 rounded-full" />
              </div>
            </div>
            <div className="space-y-2">
              <Skeleton variant="shimmer" className="h-3 w-24" />
              <Skeleton variant="shimmer" className="h-4 w-full" />
              <Skeleton variant="shimmer" className="h-4 w-3/4" />
            </div>
          </div>
        </div>

        {/* Inventory stats card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <Skeleton variant="shimmer" className="h-5 w-24" />
            <div className="flex gap-2">
              <Skeleton variant="shimmer" className="h-8 w-16 rounded-md" />
              <Skeleton variant="shimmer" className="h-8 w-20 rounded-md" />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton variant="shimmer" className="h-8 w-12 mx-auto" />
                  <Skeleton variant="shimmer" className="h-3 w-16 mx-auto" />
                </div>
              ))}
            </div>
            <Skeleton variant="shimmer" className="h-2 w-full rounded-full" />
          </CardContent>
        </Card>

        {/* Adjustments log */}
        <Card>
          <CardHeader>
            <Skeleton variant="shimmer" className="h-5 w-40" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} variant="shimmer" className="h-10 w-full rounded-md" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
