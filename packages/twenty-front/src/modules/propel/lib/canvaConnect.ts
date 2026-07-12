// Client for the "Design in Canva" round-trip (Canva Connect API).
//
// Thin wrappers over callPropelRoute('/canva/*', payload) that normalize each route's
// { ok, ... } payload OR the shared error envelope into a discriminated outcome the
// composer branches on without knowing the wire shape. A null response (network /
// non-2xx) maps to a generic, retryable error. The routes read event.body as a FLAT
// object, so we pass the payload flat (callPropelRoute also unwraps a lone { body }).

import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import {
  type CanvaCreateResponse,
  type CanvaExportResponse,
  type CanvaOauthStartResponse,
  type CanvaStatus,
  type CanvaStatusResponse,
} from '@/propel/types/canvaConnect';

const ERROR_FALLBACK: Record<string, string> = {
  ENV_MISSING: 'Canva is not connected on this environment yet.',
  NOT_FOUND: 'Connect your Canva account first, then try again.',
  TEMPLATE_INVALID: 'Canva could not complete that — try again.',
  MEDIA_UPLOAD_FAILED: "Your design was exported but couldn't be pulled in — try again.",
};

const messageFor = (res: { error?: string; code?: string } | null): string => {
  const code = res?.code ?? 'UNKNOWN';
  return (
    (typeof res?.error === 'string' && res.error) ||
    ERROR_FALLBACK[code] ||
    'Something went wrong with Canva.'
  );
};

const isEnvelopeError = (res: unknown): boolean =>
  typeof res === 'object' &&
  res !== null &&
  (res as { ok?: unknown }).ok !== true &&
  typeof (res as { code?: unknown }).code === 'string';

// POST /canva/status — normalize into the composer's CanvaStatus discriminated union.
export const fetchCanvaStatus = async (): Promise<CanvaStatus> => {
  const res = await callPropelRoute<CanvaStatusResponse>('/canva/status', {});
  if (res === null) {
    return { kind: 'error', message: "Couldn't reach Canva. Check your connection." };
  }
  if (isEnvelopeError(res)) {
    return { kind: 'error', message: messageFor(res) };
  }
  if (res.configured !== true) return { kind: 'disabled' };
  if (res.connected === true) {
    return { kind: 'connected', displayName: res.displayName ?? null };
  }
  return { kind: 'disconnected' };
};

export type StartConnectOutcome =
  | { ok: true; authorizeUrl: string }
  | { ok: false; message: string; operatorAction: string | null };

// POST /canva/oauth/start — returns the Canva authorize URL to open in a new tab.
export const startCanvaConnect = async (): Promise<StartConnectOutcome> => {
  const res = await callPropelRoute<CanvaOauthStartResponse>('/canva/oauth/start', {});
  if (res === null) {
    return { ok: false, message: "Couldn't start the Canva connection. Try again.", operatorAction: null };
  }
  if (res.ok === true && typeof res.authorizeUrl === 'string' && res.authorizeUrl) {
    return { ok: true, authorizeUrl: res.authorizeUrl };
  }
  return { ok: false, message: messageFor(res), operatorAction: res.operatorAction ?? null };
};

export type CreateDesignOutcome =
  | { ok: true; designId: string; editUrl: string; seededImage: boolean }
  | { ok: false; message: string; operatorAction: string | null };

// POST /canva/design/create — create a design (optionally seeding the post's current
// image) and return the design id + the Canva edit URL to open in a new tab.
export const createCanvaDesign = async (args: {
  title?: string;
  width?: number;
  height?: number;
  imageBytes?: string | null;
  contentType?: string | null;
}): Promise<CreateDesignOutcome> => {
  const res = await callPropelRoute<CanvaCreateResponse>('/canva/design/create', {
    ...(args.title ? { title: args.title } : {}),
    ...(typeof args.width === 'number' ? { width: args.width } : {}),
    ...(typeof args.height === 'number' ? { height: args.height } : {}),
    ...(args.imageBytes ? { imageBytes: args.imageBytes } : {}),
    ...(args.contentType ? { contentType: args.contentType } : {}),
  });
  if (res === null) {
    return { ok: false, message: "Couldn't create the Canva design. Try again.", operatorAction: null };
  }
  if (res.ok === true && typeof res.designId === 'string' && typeof res.editUrl === 'string') {
    return { ok: true, designId: res.designId, editUrl: res.editUrl, seededImage: res.seededImage === true };
  }
  return { ok: false, message: messageFor(res), operatorAction: res.operatorAction ?? null };
};

export type ExportDesignOutcome =
  | { ok: true; url: string }
  | { ok: false; message: string; operatorAction: string | null };

// POST /canva/design/export — export the design to PNG, re-host to B2, return the
// stored URL the composer swaps onto the post (the "image flows back" step).
export const exportCanvaDesign = async (designId: string): Promise<ExportDesignOutcome> => {
  const res = await callPropelRoute<CanvaExportResponse>('/canva/design/export', { designId });
  if (res === null) {
    return { ok: false, message: "Couldn't pull your design in. Try again.", operatorAction: null };
  }
  if (res.ok === true && typeof res.url === 'string' && res.url) {
    return { ok: true, url: res.url };
  }
  return { ok: false, message: messageFor(res), operatorAction: res.operatorAction ?? null };
};
