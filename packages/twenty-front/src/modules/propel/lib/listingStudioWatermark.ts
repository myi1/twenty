import { callPropelRoute } from '@/propel/lib/callPropelRoute';

// Photos step (S5) — apply the RE/MAX Hub watermark to a property photo by reusing
// the EXISTING image-watermark tool: POST /listing/watermark/stamp (the same route
// the listing-watermark-editor front-component calls). We do NOT rebuild the
// watermark pipeline — we wire to it.
//
// The hero runs on the MAIN THREAD (real DOM), so we read file bytes the normal way
// (FileReader → base64), unlike the front-component worker which needs the
// readFrontComponentFile RPC. One file per POST (the ~10 MB JSON body limit — a
// single 15 MB photo base64-encodes past it; the route accepts a `files` array but
// in practice one entry). The route forwards bytes + the four dials to the
// image-service sidecar and returns the stamped bytes base64-encoded.
//
// PF's own account watermark MUST be off (founder PF account config) so a photo is
// never double-stamped — that's an account setting, surfaced in the UI as a
// guarantee, not a second toggle (design §11).

export const MAX_PHOTO_BYTES = 7 * 1024 * 1024; // the JSON-transport cap (one file/POST)
export const SUPPORTED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// The four watermark dials — mirrors the sidecar/route contract
// (image-watermark-shared.ts). Defaults: centered, modest opacity/scale.
export interface WatermarkDials {
  opacity: number; // 0..1
  scalePercent: number; // 10..100
  rotationDeg: number; // -180..180
  positionMode: 'center' | 'manual';
  offsetXPercent: number; // -50..50
  offsetYPercent: number; // -50..50
}

export const DEFAULT_WATERMARK_DIALS: WatermarkDials = {
  opacity: 0.28,
  scalePercent: 28,
  rotationDeg: 0,
  positionMode: 'center',
  offsetXPercent: 0,
  offsetYPercent: 0,
};

export const isSupportedPhotoType = (type: string): boolean =>
  SUPPORTED_PHOTO_TYPES.includes(type);

/** Read a File's bytes as a bare base64 string (no data: prefix). */
export const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      // result is a data: URL; strip the "data:<type>;base64," prefix.
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : '');
    };
    reader.readAsDataURL(file);
  });

interface StampResponse {
  ok?: boolean;
  filename?: string;
  contentType?: string;
  contentBase64?: string;
  error?: string;
  operatorAction?: string;
}

export interface StampResult {
  ok: boolean;
  /** data: URL of the stamped photo (for preview + PF media host later). */
  dataUrl?: string;
  filename?: string;
  /** an operator-facing reason when ok=false. */
  error?: string;
}

/**
 * Watermark one photo: bytes → base64 → /listing/watermark/stamp → stamped data URL.
 * Soft-fails (returns ok:false + reason) instead of throwing — the Photos step
 * keeps the original on failure and surfaces the message.
 */
export const watermarkPhoto = async (
  file: File,
  dials: WatermarkDials,
): Promise<StampResult> => {
  if (!isSupportedPhotoType(file.type)) {
    return { ok: false, error: `${file.name}: use a JPG, PNG, or WebP image.` };
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return { ok: false, error: `${file.name} is too large — keep each photo under 7 MB.` };
  }
  let base64: string;
  try {
    base64 = await fileToBase64(file);
  } catch {
    return { ok: false, error: `Couldn't read ${file.name}. Try re-selecting it.` };
  }
  if (!base64) {
    return { ok: false, error: `Couldn't read ${file.name}.` };
  }

  const res = await callPropelRoute<StampResponse>('/listing/watermark/stamp', {
    files: [{ filename: file.name, contentType: file.type, contentBase64: base64 }],
    settings: dials,
  });

  if (!res || res.ok !== true || !res.contentBase64 || !res.contentType) {
    return {
      ok: false,
      error:
        res?.operatorAction ||
        res?.error ||
        'The watermark service is unavailable — using the original photo for now.',
    };
  }
  return {
    ok: true,
    dataUrl: `data:${res.contentType};base64,${res.contentBase64}`,
    filename: res.filename,
  };
};
