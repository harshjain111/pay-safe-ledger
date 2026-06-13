// ============================================================================
// Punch -> attendance-session reducer (pure, dependency-free).
//
// This is the SINGLE source of truth for turning a stream of device punches
// (direction in/out) into attendance_sessions rows. It is imported by BOTH:
//   - the `ingest-punches` edge function (Deno runtime), and
//   - the vitest suite (Node runtime, src/lib/punch-normalize.test.ts)
// so the pairing / de-duplication logic is tested exactly as it runs in prod.
//
// It performs NO IO. It has no Deno or browser globals. Keep it that way.
// ============================================================================

export type PunchDirection = "in" | "out";

export interface OpenSession {
  /** attendance_sessions.id (real id from DB, or a temp id for a session
   *  opened earlier in the same batch). */
  id: string;
  /** ISO timestamp of the check-in. */
  check_in_at: string;
  status: "active" | "on_break" | "completed";
}

export interface PunchInput {
  staffId: string;
  direction: PunchDirection;
  /** ISO instant of the punch. */
  ts: string;
  /** YYYY-MM-DD in the business timezone. */
  workDate: string;
}

export type NormalizeAction =
  | {
      kind: "open";
      staffId: string;
      /** Placeholder id for the session this punch opens; the caller maps it to
       *  the real inserted id so a later OUT in the same batch can resolve it. */
      tempId: string;
      check_in_at: string;
      work_date: string;
    }
  | {
      kind: "close";
      staffId: string;
      /** Either a real DB session id (seeded) or a tempId from an earlier open
       *  in this batch. */
      session_id: string;
      check_out_at: string;
      worked_minutes: number;
    }
  | {
      kind: "noop";
      staffId: string;
      reason: "duplicate-in" | "no-open-session";
    };

export interface ReduceResult {
  /** Index of this punch in the original input array. */
  index: number;
  input: PunchInput;
  action: NormalizeAction;
}

/** Whole minutes between two ISO instants, clamped to >= 0 (mirrors the in-app
 *  checkOut math: Math.max(0, round((out - in) / 60000))). */
export function minutesBetween(startIso: string, endIso: string): number {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (!Number.isFinite(ms)) return 0;
  return Math.max(0, Math.round(ms / 60000));
}

function isOpenSession(s: OpenSession | null | undefined): boolean {
  return s != null && s.status !== "completed";
}

/**
 * Reduce a batch of punches into attendance-session actions.
 *
 * Events are processed in chronological order (by `ts`), threading an in-memory
 * map of each staff member's current open session — seeded from the DB so that
 * an OUT can close a session opened on a previous request. Within one batch an
 * IN followed by an OUT pairs into open + close; a repeated IN collapses to a
 * no-op (logical de-duplication); an OUT with no open session is a no-op.
 *
 * The returned actions are in APPLICATION order (chronological). Each carries
 * the original `index` so the caller can link it back to its punch_events row.
 */
export function reducePunches(
  events: PunchInput[],
  seedOpenByStaff: Record<string, OpenSession | null> = {},
): ReduceResult[] {
  const open: Record<string, OpenSession | null> = { ...seedOpenByStaff };

  const ordered = events
    .map((input, index) => ({ input, index }))
    .sort((a, b) => {
      const ta = new Date(a.input.ts).getTime();
      const tb = new Date(b.input.ts).getTime();
      if (ta === tb) return a.index - b.index; // stable on ties
      return ta - tb;
    });

  const results: ReduceResult[] = [];
  let seq = 0;

  for (const { input, index } of ordered) {
    const current = open[input.staffId] ?? null;
    let action: NormalizeAction;

    if (input.direction === "in") {
      if (isOpenSession(current)) {
        action = { kind: "noop", staffId: input.staffId, reason: "duplicate-in" };
      } else {
        const tempId = `pending-${seq++}`;
        action = {
          kind: "open",
          staffId: input.staffId,
          tempId,
          check_in_at: input.ts,
          work_date: input.workDate,
        };
        open[input.staffId] = { id: tempId, check_in_at: input.ts, status: "active" };
      }
    } else {
      if (!isOpenSession(current)) {
        action = { kind: "noop", staffId: input.staffId, reason: "no-open-session" };
      } else {
        action = {
          kind: "close",
          staffId: input.staffId,
          session_id: current!.id,
          check_out_at: input.ts,
          worked_minutes: minutesBetween(current!.check_in_at, input.ts),
        };
        open[input.staffId] = null;
      }
    }

    results.push({ index, input, action });
  }

  return results;
}
