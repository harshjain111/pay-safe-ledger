import type { FaceProvider } from './FaceProvider';
import { StubFaceProvider } from './StubFaceProvider';

export type { FaceProvider } from './FaceProvider';
export type {
  FaceImage,
  FaceEnrolInput,
  FaceEnrolResult,
  FaceMatchInput,
  FaceMatchResult,
} from './FaceProvider';

// ============================================================================
// Provider selection.
//
// Pick the active face provider from VITE_FACE_PROVIDER (default: 'stub').
// To onboard a real vendor: implement FaceProvider, add a case below, and set
// the env var. Nothing else in the app needs to change.
// ============================================================================

let cached: FaceProvider | null = null;

export function getFaceProvider(): FaceProvider {
  if (cached) return cached;

  const choice = (import.meta.env.VITE_FACE_PROVIDER ?? 'stub').toString().toLowerCase();
  switch (choice) {
    case 'stub':
      cached = new StubFaceProvider();
      break;
    // case 'rekognition': cached = new RekognitionFaceProvider(); break;
    // case 'azure':       cached = new AzureFaceProvider();       break;
    default:
      console.warn(`[face] Unknown VITE_FACE_PROVIDER "${choice}" — falling back to stub.`);
      cached = new StubFaceProvider();
  }
  return cached;
}
