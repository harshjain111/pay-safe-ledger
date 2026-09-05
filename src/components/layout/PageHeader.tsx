import { cn } from "@/lib/utils";

/**
 * The page header used by the older screens.
 *
 * Geometry is deliberately identical to the patterns PageHeader — same title
 * size, same description treatment, same gap — because the app was running two
 * headers with different type scales, so a page's title changed size depending
 * on which era it was written in. Two components, one look; the pages can
 * converge on the patterns one over time without a visible step.
 *
 * The bottom margin stays: these screens predate the space-y page shell and
 * some rely on the header to provide their own separation.
 */
interface PageHeaderProps {
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, children, className }: PageHeaderProps) {
  return (
    <div className={cn("mb-6 flex flex-wrap items-start gap-3", className)}>
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        {description && (
          <p className="mt-0.5 text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {children && (
        <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>
      )}
    </div>
  );
}
