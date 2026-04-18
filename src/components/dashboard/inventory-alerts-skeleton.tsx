import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function InventoryAlertsSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton variant="shimmer" className="h-5 w-40" />
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="space-y-2">
            <Skeleton variant="shimmer" className="h-4 w-32" />
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} variant="shimmer" className="h-8 w-full rounded-md" />
            ))}
          </div>
          <div className="space-y-2">
            <Skeleton variant="shimmer" className="h-4 w-32" />
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} variant="shimmer" className="h-8 w-full rounded-md" />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
