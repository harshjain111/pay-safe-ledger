import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { X, ArrowRight, ArrowLeft, Sparkles } from 'lucide-react';

export interface TourStep {
  /** data-tour attribute value to spotlight; omit for a centered card. */
  target?: string;
  title: string;
  body: string;
}

interface Rect { top: number; left: number; width: number; height: number; }

const PAD = 8;

function firstVisible(target?: string): HTMLElement | null {
  if (!target) return null;
  const els = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`));
  return els.find((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }) ?? null;
}

function getRect(target?: string): Rect | null {
  const el = firstVisible(target);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 };
}

export function ProductTour({ steps, onClose }: { steps: TourStep[]; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const step = steps[i];

  const measure = useCallback(() => {
    const el = firstVisible(step?.target);
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    // let the scroll settle before measuring
    window.setTimeout(() => setRect(getRect(step?.target)), el ? 260 : 0);
  }, [step?.target]);

  useLayoutEffect(() => { measure(); }, [measure]);

  useEffect(() => {
    const onResize = () => setRect(getRect(step?.target));
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [step?.target]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setI((v) => Math.min(steps.length - 1, v + 1));
      if (e.key === 'ArrowLeft') setI((v) => Math.max(0, v - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [steps.length, onClose]);

  if (!step) return null;
  const last = i === steps.length - 1;

  // Callout position: below the spotlight if room, else above; centered when no target.
  const vh = window.innerHeight;
  const calloutStyle: React.CSSProperties = rect
    ? rect.top + rect.height + 190 < vh
      ? { top: rect.top + rect.height + 12, left: Math.max(12, Math.min(rect.left, window.innerWidth - 348)) }
      : { top: Math.max(12, rect.top - 12), left: Math.max(12, Math.min(rect.left, window.innerWidth - 348)), transform: 'translateY(-100%)' }
    : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };

  return (
    <div className="fixed inset-0 z-[100]" aria-modal role="dialog">
      {/* Dim + spotlight (box-shadow ring cuts a hole around the target) */}
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-xl transition-all duration-300 ease-out"
          style={{
            top: rect.top, left: rect.left, width: rect.width, height: rect.height,
            boxShadow: '0 0 0 9999px rgba(2,6,23,0.72)',
            outline: '2px solid hsl(var(--primary))',
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-slate-950/70" onClick={onClose} />
      )}

      {/* Callout */}
      <div
        className="absolute w-[320px] max-w-[calc(100vw-24px)] animate-in fade-in zoom-in-95 duration-200"
        style={calloutStyle}
      >
        <div className="rounded-xl border bg-card p-4 shadow-2xl">
          <div className="mb-2 flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
                <Sparkles className="h-4 w-4 text-primary" />
              </span>
              <h3 className="text-sm font-semibold">{step.title}</h3>
            </div>
            <button onClick={onClose} aria-label="Close tour" className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="text-sm text-muted-foreground">{step.body}</p>

          <div className="mt-4 flex items-center justify-between">
            <div className="flex gap-1">
              {steps.map((_, idx) => (
                <span key={idx} className={`h-1.5 rounded-full transition-all ${idx === i ? 'w-4 bg-primary' : 'w-1.5 bg-muted-foreground/30'}`} />
              ))}
            </div>
            <div className="flex gap-1.5">
              {i > 0 && (
                <Button size="sm" variant="ghost" onClick={() => setI((v) => v - 1)} className="h-8 gap-1 px-2">
                  <ArrowLeft className="h-3.5 w-3.5" /> Back
                </Button>
              )}
              {last ? (
                <Button size="sm" onClick={onClose} className="h-8">Got it 🎉</Button>
              ) : (
                <Button size="sm" onClick={() => setI((v) => v + 1)} className="h-8 gap-1">
                  Next <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Skip */}
      <button
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full bg-card/90 px-3 py-1 text-xs font-medium text-muted-foreground shadow hover:text-foreground"
      >
        Skip tour
      </button>
    </div>
  );
}
