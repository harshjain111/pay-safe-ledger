import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { EmptyState as PatternEmptyState } from "@/components/patterns/EmptyState";

/**
 * @deprecated Import EmptyState from '@/components/patterns' instead.
 *
 * This is now an adapter, not a second implementation. The app had two empty
 * states with the SAME NAME and different prop names — `description` here,
 * `instruction` there — so importing the wrong one either failed to compile or
 * silently dropped the text. They also rendered differently, which is why empty
 * screens did not match each other.
 *
 * Both call sites now render the pattern component, so there is one look. The
 * 33 existing usages keep working unchanged; new code should use the pattern
 * directly and write an instruction that names the control to use next, rather
 * than a bare description.
 */
interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  /** Maps to the pattern's `instruction`. */
  description: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <PatternEmptyState
      icon={icon}
      title={title}
      instruction={description}
      action={action}
      className={className}
    />
  );
}
