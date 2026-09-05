import { cn } from "@/lib/utils";

/**
 * Loading placeholder.
 *
 * A sweep rather than a pulse: a pulse dims the whole block on a timer, which
 * reads as something disabled, while a highlight travelling across it reads as
 * work in progress. Size each one to the content it stands in for, so the
 * layout does not jump when the real thing arrives.
 *
 * The sweep is suppressed under prefers-reduced-motion (see index.css), leaving
 * a plain block — still a placeholder, just a still one.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("skeleton-sweep rounded-md bg-muted", className)}
      aria-hidden="true"
      {...props}
    />
  );
}

export { Skeleton };
