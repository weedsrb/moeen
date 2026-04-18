import { cn } from "@/lib/utils"

type SkeletonProps = React.ComponentProps<"div"> & {
  variant?: "pulse" | "shimmer"
}

function Skeleton({ className, variant = "pulse", ...props }: SkeletonProps) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "rounded-md",
        variant === "shimmer" ? "skeleton-shimmer" : "animate-pulse bg-muted",
        className,
      )}
      {...props}
    />
  )
}

export { Skeleton }
