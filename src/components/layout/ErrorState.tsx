import { cn } from "@/lib/utils";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorStateProps {
  title?: string;
  description?: string;
  /** When provided, renders a "Try again" button that calls this handler. */
  onRetry?: () => void;
  /** Shows a spinner + disables the retry button while a retry is in flight. */
  retrying?: boolean;
  className?: string;
}

/**
 * Standard error placeholder for data-loading failures.
 * Pair with a page-level `error` flag so failed fetches show a recoverable
 * state instead of a blank screen or stale data.
 */
export function ErrorState({
  title = "Something went wrong",
  description = "We couldn't load this data. Please check your connection and try again.",
  onRetry,
  retrying = false,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn("flex flex-col items-center justify-center py-16 text-center", className)}
      role="alert"
    >
      <div className="rounded-full bg-destructive/10 p-4 mb-4">
        <AlertTriangle className="h-10 w-10 text-destructive" />
      </div>
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground max-w-sm">{description}</p>
      {onRetry && (
        <div className="mt-6">
          <Button variant="outline" onClick={onRetry} disabled={retrying}>
            <RefreshCw className={cn("mr-2 h-4 w-4", retrying && "animate-spin")} />
            {retrying ? "Retrying..." : "Try again"}
          </Button>
        </div>
      )}
    </div>
  );
}
