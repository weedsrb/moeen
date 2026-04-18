import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function FlagsLoading() {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-visible space-y-6">
      <Skeleton variant="shimmer" className="h-8 w-48" />
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton variant="shimmer" className="h-5 w-20" />
          </CardHeader>
          <CardContent>
            <Skeleton variant="shimmer" className="h-4 w-40" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
