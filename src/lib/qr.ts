import * as QRCode from 'qrcode';

/**
 * Render `text` to a PNG data URL for embedding in a jsPDF via `doc.addImage`.
 * Used to stamp payslips and report exports with a scannable verification block.
 */
export async function qrPngDataUrl(text: string, widthPx = 256): Promise<string> {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: widthPx,
  });
}

/**
 * Tiny non-cryptographic fingerprint (FNV-1a → 8 hex chars) of a document's
 * canonical fields. It is a tamper-EVIDENT stamp, NOT a signature: it lets a
 * verifier recompute the ref from the printed figures and spot a casual edit, but
 * it is not secret-keyed, so it does not defeat a determined forger. A future
 * server-side HMAC (with a verify endpoint) would upgrade this to true authenticity.
 */
export function docFingerprint(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).toUpperCase().padStart(8, '0');
}
