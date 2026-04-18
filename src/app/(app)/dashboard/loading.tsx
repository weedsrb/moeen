import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function DashboardLoading() {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-visible space-y-6">
      <Skeleton variant="shimmer" className="h-8 w-36" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <Skeleton variant="shimmer" className="h-4 w-20" />
              <Skeleton variant="shimmer" className="h-4 w-4 rounded" />
            </CardHeader>
            <CardContent>
              <Skeleton variant="shimmer" className="h-8 w-12" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <Skeleton variant="shimmer" className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton variant="shimmer" className="h-16 w-full" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton variant="shimmer" className="h-5 w-36" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton variant="shimmer" className="h-8 w-10 mx-auto" />
                <Skeleton variant="shimmer" className="h-3 w-16 mx-auto" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
