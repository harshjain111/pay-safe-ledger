import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

function Boom({ message }: { message: string }): JSX.Element {
  throw new Error(message);
}

describe('ErrorBoundary', () => {
  beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('shows the actual error message instead of swallowing it', () => {
    render(<ErrorBoundary><Boom message="Invalid time value" /></ErrorBoundary>);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    // The whole point of the change: the message is on screen, not only in
    // the console where a screenshot cannot reach it.
    expect(screen.getByText('Invalid time value')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy details/i })).toBeInTheDocument();
  });

  it('explains a stale chunk as an old tab, not as a broken page', () => {
    render(
      <ErrorBoundary>
        <Boom message="Failed to fetch dynamically imported module: /assets/Page-abc.js" />
      </ErrorBoundary>,
    );
    expect(screen.getByText('This tab is running an old version')).toBeInTheDocument();
    // No raw message and no copy button here — there is nothing for anyone to
    // report; the page itself is fine.
    expect(screen.queryByRole('button', { name: /copy details/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reload app/i })).toBeInTheDocument();
  });

  it('announces itself to assistive tech', () => {
    render(<ErrorBoundary><Boom message="anything" /></ErrorBoundary>);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('renders children when nothing throws', () => {
    render(<ErrorBoundary><p>All good</p></ErrorBoundary>);
    expect(screen.getByText('All good')).toBeInTheDocument();
  });
});
