// ============================================================================
// FaceProvider — vendor-agnostic face-recognition seam (phase 2).
//
// Face matching is done behind this interface so the vendor (AWS Rekognition,
// Azure Face, an on-prem SDK, etc.) can be swapped without touching the rest of
// the app. The contract is deliberately small: enrol a staff member's face and
// match a probe image back to a staff member.
//
// DATA RETENTION (enforced by contract, see docs/biometric-attendance.md):
//   • Providers return only an opaque VECTOR REFERENCE (e.g. a vendor face id or
//     a stored-vector handle). We persist that ref on biometric_enrolments
//     (face_vector_ref) — never the raw image or the raw embedding.
//   • Raw capture frames passed to enrol()/match() are transient: the provider
//     processes them and they are discarded. Nothing writes images to our DB or
//     storage.
// ============================================================================

/** A capture handed to the provider. Either binary image data or a reference
 *  the provider already understands (e.g. a temporary upload URL). */
export type FaceImage = Blob | ArrayBuffer | string;

export interface FaceEnrolInput {
  staffId: string;
  /** Optional during phase-2 scaffolding — a real provider requires it. */
  image?: FaceImage;
}

export interface FaceEnrolResult {
  ok: boolean;
  /** Opaque reference stored on the enrolment. NEVER a raw image/embedding. */
  vectorRef?: string;
  error?: string;
}

export interface FaceMatchInput {
  image: FaceImage;
}

export interface FaceMatchResult {
  matched: boolean;
  /** Resolved staff id when matched. */
  staffId?: string;
  /** Confidence in [0, 1]. */
  score: number;
}

export interface FaceProvider {
  /** Human-readable provider name (shown in settings/diagnostics). */
  readonly name: string;
  enrol(input: FaceEnrolInput): Promise<FaceEnrolResult>;
  match(input: FaceMatchInput): Promise<FaceMatchResult>;
}
