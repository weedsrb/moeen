import { cn } from "@/lib/utils";

interface PageTransitionProps {
  children: React.ReactNode;
  className?: string;
}

export function PageTransition({ children, className }: PageTransitionProps) {
  return (
    <div
      className={cn(
        "page-fade flex-1 min-h-0 overflow-y-auto px-1",
        className,
      )}
    >
      {children}
    </div>
  );
}
