/**
 * Sonner-compatible toast wrapper over the shadcn useToast system.
 *
 * The app standardizes on the shadcn `<Toaster />` (src/hooks/use-toast.ts).
 * This wrapper mirrors sonner's `toast.success(...)` / `toast.error(...)` API so
 * existing call sites keep working by only swapping their import to '@/lib/toast'.
 *
 * shadcn toast only ships two variants (`default`, `destructive`), so:
 *   success / info / warning / message -> default
 *   error                             -> destructive
 */
import type { ReactNode } from 'react';
import { toast as shadcnToast } from '@/hooks/use-toast';

type ToastOptions = {
  description?: ReactNode;
};

function show(
  message: ReactNode,
  variant: 'default' | 'destructive',
  options?: ToastOptions,
) {
  return shadcnToast({
    title: message,
    description: options?.description,
    variant,
  });
}

export const toast = Object.assign(
  (message: ReactNode, options?: ToastOptions) => show(message, 'default', options),
  {
    success: (message: ReactNode, options?: ToastOptions) =>
      show(message, 'default', options),
    error: (message: ReactNode, options?: ToastOptions) =>
      show(message, 'destructive', options),
    info: (message: ReactNode, options?: ToastOptions) =>
      show(message, 'default', options),
    warning: (message: ReactNode, options?: ToastOptions) =>
      show(message, 'default', options),
    message: (message: ReactNode, options?: ToastOptions) =>
      show(message, 'default', options),
  },
);
