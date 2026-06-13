import type {
  FaceProvider,
  FaceEnrolInput,
  FaceEnrolResult,
  FaceMatchInput,
  FaceMatchResult,
} from './FaceProvider';

// ============================================================================
// StubFaceProvider — the default (phase 2 scaffold).
//
// It performs NO real face recognition and makes NO external calls. enrol()
// returns a deterministic placeholder vector reference so the enrolment flow is
// fully wired end-to-end; match() never matches. Swapping in a real vendor is a
// one-line change in ./index.ts — no call site changes.
//
// It never receives, stores, or transmits a raw image: it ignores the `image`
// field entirely and returns only an opaque ref.
// ============================================================================

export class StubFaceProvider implements FaceProvider {
  readonly name = 'stub';

  async enrol(input: FaceEnrolInput): Promise<FaceEnrolResult> {
    // A stable, non-reversible placeholder ref keyed to the staff id.
    return { ok: true, vectorRef: `stub:vec:${input.staffId}` };
  }

  async match(_input: FaceMatchInput): Promise<FaceMatchResult> {
    // The stub cannot identify anyone; real matching arrives with a vendor.
    return { matched: false, score: 0 };
  }
}
