import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Copy, Check } from 'lucide-react';
import { isStaleChunkError } from '@/lib/lazy-route';

// ---------------------------------------------------------------------------
// App-wide error boundary.
//
// It used to keep a single `hasError` boolean and console.error the rest. That
// made every failure look identical — "An unexpected error occurred" — and
// left nothing to act on: the person seeing it could not say what broke, and
// nobody reading a screenshot of it could either. The error is now kept and
// shown, with a copy button, so a report carries the actual message.
//
// The stale-chunk case gets its own wording because it is not a fault in the
// page at all: a deploy landed while the tab was open and the chunk it asked
// for is gone. lazyRoute reloads once on its own, so reaching this screen with
// that error means the reload has already been tried.
// ---------------------------------------------------------------------------

interface Props { children: ReactNode }
interface State { error: Error | null; componentStack: string | null; copied: boolean }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: null, copied: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ componentStack: info.componentStack ?? null });
    console.error('Unhandled render error:', error, info.componentStack);
  }

  private details(): string {
    const { error, componentStack } = this.state;
    return [
      `Message: ${error?.message ?? 'unknown'}`,
      `Page: ${window.location.pathname}`,
      `Time: ${new Date().toISOString()}`,
      error?.stack ? `\nStack:\n${error.stack}` : '',
      componentStack ? `\nComponents:${componentStack}` : '',
    ].join('\n');
  }

  private handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(this.details());
      this.setState({ copied: true });
    } catch {
      // Clipboard blocked (insecure context, or the user denied it). The text
      // is on screen anyway, so there is nothing to recover from.
    }
  };

  private handleReload = () => { window.location.reload(); };

  render() {
    const { error, copied } = this.state;
    if (!error) return this.props.children;

    const stale = isStaleChunkError(error);

    return (
      <div
        role="alert"
        className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center"
      >
        <AlertTriangle className="h-10 w-10 text-destructive" aria-hidden="true" />
        <div className="max-w-md space-y-1.5">
          <h1 className="text-lg font-semibold">
            {stale ? 'This tab is running an old version' : 'Something went wrong'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {stale
              ? 'The app was updated while this tab was open, so part of it could no longer be downloaded. Reloading picks up the new version.'
              : 'This page failed to load. Reloading often fixes it — if it does not, send the details below.'}
          </p>
        </div>

        {!stale && (
          <p className="max-w-md break-words rounded-lg border bg-muted/40 px-3 py-2 text-left font-mono text-xs text-muted-foreground">
            {error.message || String(error)}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button onClick={this.handleReload}>Reload app</Button>
          {!stale && (
            <Button variant="outline" onClick={this.handleCopy}>
              {copied
                ? <><Check className="mr-2 h-4 w-4" aria-hidden="true" />Copied</>
                : <><Copy className="mr-2 h-4 w-4" aria-hidden="true" />Copy details</>}
            </Button>
          )}
        </div>
      </div>
    );
  }
}
