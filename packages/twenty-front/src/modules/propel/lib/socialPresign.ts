// Large-media (video) upload for the social composer via a PRESIGNED B2 PUT.
//
// WHY a separate path from /marketing/media/upload: that route takes the file as
// base64 in the request body, which is fine for small images but blows past the
// server's decode cap (7 MB) and is wasteful for big videos. Instead we ask the CRM
// for a short-lived presigned B2 URL and PUT the raw File bytes STRAIGHT to B2 — the
// bytes never transit our logic-function, so there's no practical size limit (we cap
// at 100 MB client-side for sanity + progress UX). On success we attach the video to
// the post by its public URL, which the existing save flow already accepts (save-post
// imageUrls[] + the VIDEO_EXT kind detection treat a video URL the same as an image).
//
// CONTRACT (sibling CRM lane — feat/round2-campaign, route POST /marketing/media/presign):
//   request  body: { filename, contentType, sizeBytes, scope }
//   response body: { key, uploadUrl, publicUrl }   (or the marketing error envelope)
// This local caller is written against that exact contract; it will reconcile with the
// sibling lane's typed client at integration (the wire shape is the source of truth).

import { callPropelRoute } from '@/propel/lib/callPropelRoute';

// 100 MB ceiling for the presigned video path (the composer enforces this before we
// even request a presign). B2 itself handles far larger, but 100 MB is a sane social
// limit and keeps a single PUT + progress bar responsive.
export const VIDEO_MAX_BYTES = 100 * 1024 * 1024;

// The presign request's `scope` — namespaces the B2 key server-side (e.g. social/…).
// Kept as a constant so the one social caller is unambiguous; widen to a param if
// other surfaces (email/WA) ever reuse this util.
const SOCIAL_SCOPE = 'social';

export type PresignOutcome =
  | { ok: true; key: string; uploadUrl: string; publicUrl: string }
  | { ok: false; message: string; operatorAction: string | null };

// Ask the CRM for a presigned B2 upload URL for this file. The route reads
// event.body, so callPropelRoute sends the flat payload (it un-wraps a lone {body}).
// Success is the presence of a string uploadUrl + publicUrl + key; anything else is
// treated as the marketing error envelope ({ error, operatorAction }) — never swallowed.
const requestPresign = async (file: File): Promise<PresignOutcome> => {
  const res = await callPropelRoute<{
    key?: string;
    uploadUrl?: string;
    publicUrl?: string;
    error?: string;
    operatorAction?: string;
  }>('/marketing/media/presign', {
    filename: file.name,
    // Browsers occasionally hand us an empty type for some containers; fall back to
    // a generic video type so the presign route + B2 still get a content type.
    contentType: file.type || 'video/mp4',
    sizeBytes: file.size,
    scope: SOCIAL_SCOPE,
  });

  if (res === null) {
    return {
      ok: false,
      message: "Couldn't reach the server to start the upload.",
      operatorAction: 'Check your connection and try again.',
    };
  }

  if (
    typeof res.uploadUrl === 'string' &&
    typeof res.publicUrl === 'string' &&
    typeof res.key === 'string'
  ) {
    return {
      ok: true,
      key: res.key,
      uploadUrl: res.uploadUrl,
      publicUrl: res.publicUrl,
    };
  }

  return {
    ok: false,
    message:
      (typeof res.error === 'string' && res.error) ||
      "Couldn't prepare the upload — try a smaller file or try again.",
    operatorAction: res.operatorAction ?? null,
  };
};

// PUT the raw File bytes to the presigned B2 URL. We use XMLHttpRequest (not fetch) so
// we can report upload PROGRESS — fetch has no upload-progress event. A non-2xx from
// B2, or a network error, resolves to `ok: false` (we never throw to the caller).
const putToPresignedUrl = (
  uploadUrl: string,
  file: File,
  onProgress: (fraction: number) => void,
): Promise<{ ok: true } | { ok: false; message: string }> =>
  new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl, true);
    // B2's presigned PUT expects the content type to match what was signed.
    xhr.setRequestHeader('content-type', file.type || 'video/mp4');

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) {
        onProgress(Math.min(1, e.loaded / e.total));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1);
        resolve({ ok: true });
      } else {
        resolve({
          ok: false,
          message: `Upload failed (HTTP ${xhr.status}). Try again.`,
        });
      }
    };
    xhr.onerror = () =>
      resolve({ ok: false, message: 'Upload failed — network error. Try again.' });
    xhr.onabort = () =>
      resolve({ ok: false, message: 'Upload cancelled.' });

    xhr.send(file);
  });

export type VideoUploadOutcome =
  | { ok: true; publicUrl: string }
  | { ok: false; message: string; operatorAction: string | null };

// Full large-video flow: validate size → presign → PUT bytes to B2 (with progress) →
// resolve the public URL the composer attaches as media. `onProgress` is called with a
// 0..1 fraction so the tile can show a real upload bar (presign + final attach are
// treated as the 0% / 100% bookends).
export const uploadLargeVideo = async (
  file: File,
  onProgress: (fraction: number) => void,
): Promise<VideoUploadOutcome> => {
  if (file.size > VIDEO_MAX_BYTES) {
    const maxMb = Math.floor(VIDEO_MAX_BYTES / (1024 * 1024));
    return {
      ok: false,
      message: `That video is too large (max ${maxMb} MB).`,
      operatorAction: 'Trim or compress it and try again.',
    };
  }

  onProgress(0);
  const presign = await requestPresign(file);
  if (!presign.ok) {
    return {
      ok: false,
      message: presign.message,
      operatorAction: presign.operatorAction,
    };
  }

  const put = await putToPresignedUrl(presign.uploadUrl, file, onProgress);
  if (!put.ok) {
    return { ok: false, message: put.message, operatorAction: null };
  }

  return { ok: true, publicUrl: presign.publicUrl };
};

// Whether a file should take the large-video presigned path. Images and small videos
// keep the existing base64 /marketing/media/upload route; large videos go to B2.
const VIDEO_TYPE = /^video\//i;
const VIDEO_EXT = /\.(mp4|mov|webm|m4v|ogg)(\?|#|$)/i;

export const isVideoFile = (file: File): boolean =>
  VIDEO_TYPE.test(file.type) || VIDEO_EXT.test(file.name);
