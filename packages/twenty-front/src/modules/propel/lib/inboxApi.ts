// Route + compose helpers for the unified Inbox hero tab.
//
// All five inbox routes are UNCHANGED from the legacy app-sandbox and read a FLAT
// `event.body` (verified in propel-crm-integration src/logic-functions/marketing-
// inbox-*-route.ts), so callPropelRoute is given a flat payload — never the
// `{ body: {...} }` wrapper the media/social routes need. callPropelRoute returns
// the parsed JSON on 2xx or `null` (network / non-2xx), so every error envelope
// (COMPLIANCE_BLOCK, 24h-window, ENV_MISSING) is preserved, and a transport failure
// is a single `null` the callers map to a clean error state.

import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import {
  type InboxChannel,
  type InboxPayload,
  type InboxThreadPayload,
  type InboxAiResponse,
  type OutboundMediaKind,
  type ReplySendEnvelope,
} from '@/propel/types/inbox';

// ── Route calls ──────────────────────────────────────────────────────────────

export const fetchInbox = (): Promise<InboxPayload | null> =>
  callPropelRoute<InboxPayload>('/marketing/inbox', {});

export const fetchInboxThread = (
  id: string,
  channel: InboxChannel,
): Promise<InboxThreadPayload | null> =>
  callPropelRoute<InboxThreadPayload>('/marketing/inbox-thread', { id, channel });

export const sendInboxReply = (args: {
  id: string;
  channel: InboxChannel;
  body: string;
  media?: { url: string; kind: OutboundMediaKind; fileName: string } | null;
}): Promise<ReplySendEnvelope | null> =>
  callPropelRoute<ReplySendEnvelope>('/marketing/inbox-reply', {
    id: args.id,
    channel: args.channel,
    body: args.body,
    ...(args.media
      ? {
          mediaUrl: args.media.url,
          mediaKind: args.media.kind,
          fileName: args.media.fileName,
        }
      : {}),
  });

export const fetchInboxAi = (args: {
  mode: 'suggest' | 'improve' | 'insights';
  conversationId: string;
  channel: InboxChannel;
  draft?: string;
}): Promise<InboxAiResponse | null> =>
  callPropelRoute<InboxAiResponse>('/marketing/inbox-ai', {
    mode: args.mode,
    conversationId: args.conversationId,
    channel: args.channel,
    ...(args.mode === 'improve' && typeof args.draft === 'string'
      ? { draft: args.draft }
      : {}),
  });

export const saveInboxMedia = (
  messageId: string,
  channel: InboxChannel,
): Promise<{ ok?: boolean; error?: string; operatorAction?: string } | null> =>
  callPropelRoute<{ ok?: boolean; error?: string; operatorAction?: string }>(
    '/marketing/inbox/save-media',
    { messageId, channel },
  );

// ── Keyboard-send decision ───────────────────────────────────────────────────
// Send ONLY on a bare Enter: not Shift (Shift+Enter = newline), not Meta/Ctrl/Alt,
// and not mid-IME-composition (isComposing OR keyCode 229 for Android/legacy IMEs)
// — pressing Enter to CONFIRM a CJK/Hangul candidate must not fire the message.
export interface SendKeyEvent {
  key: string;
  shiftKey: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  keyCode?: number;
  nativeEvent?: { isComposing?: boolean };
}

export const shouldSendOnKeyDown = (e: SendKeyEvent): boolean => {
  if (e.key !== 'Enter') return false;
  if (e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return false;
  if (e.nativeEvent?.isComposing) return false;
  if (e.keyCode === 229) return false;
  return true;
};

// ── Send-result interpretation ───────────────────────────────────────────────
// A send is a SUCCESS only when the envelope is present, has no `error`, and is
// explicitly `ok: true`. Everything else — a typed error envelope, a missing/false
// `ok`, or a `null` (network failure) — is a FAILURE. This is the founder's gap: a
// COMPLIANCE_BLOCK / 24h-window rejection returned a truthy `error` (or omitted
// `ok`), so a success-only clear never ran and there was no visible reason.
export type SendOutcome =
  | { ok: true; message: string; tone: 'success' | 'info' }
  | { ok: false; message: string };

const DEFAULT_SEND_ERROR = 'Could not send the reply. Your text is saved.';

export const interpretSendResult = (
  res: ReplySendEnvelope | null,
): SendOutcome => {
  if (!res || res.error || !res.ok) {
    const message = res?.operatorAction || res?.error || DEFAULT_SEND_ERROR;
    return { ok: false, message };
  }
  if (res.warning) {
    return { ok: true, message: res.warning, tone: 'info' };
  }
  return { ok: true, message: 'Reply sent.', tone: 'success' };
};

// ── Outbound media ───────────────────────────────────────────────────────────
// 7 MB per item — mirrors the server cap (marketing-media.ts MEDIA_MAX_DECODED_BYTES,
// transport-bounded by Twenty's 10 MB JSON body limit). Enforced client-side from
// file.size before reading bytes, and again server-side.
export const MEDIA_MAX_BYTES = 7 * 1024 * 1024;

// The brokerage chat-attachment gate: images + video + the document set (contracts,
// MOUs, floor plans, brochures). Mirrors isAllowedInboxMediaType server-side.
const isImageType = (t: string): boolean => /^image\/[a-z0-9.+-]+$/i.test(t);
const isVideoType = (t: string): boolean => /^video\/[a-z0-9.+-]+$/i.test(t);
const isAudioType = (t: string): boolean => /^audio\/[a-z0-9.+-]+$/i.test(t);
const ALLOWED_DOCUMENT_TYPES = new Set<string>([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

export const isAllowedInboxMediaType = (t: unknown): t is string =>
  typeof t === 'string' &&
  (isImageType(t) || isVideoType(t) || ALLOWED_DOCUMENT_TYPES.has(t.toLowerCase().trim()));

// The outbound media kind for an upload, derived from its content-type. STICKER is
// inbound-only (no generic sticker-send), so it is never produced here; an
// unrecognized type falls back to DOCUMENT (send-as-file, the safe fallback).
export const outboundMediaKindFromContentType = (t: unknown): OutboundMediaKind => {
  if (typeof t === 'string') {
    if (isImageType(t)) return 'IMAGE';
    if (isVideoType(t)) return 'VIDEO';
    if (isAudioType(t)) return 'AUDIO';
  }
  return 'DOCUMENT';
};

// Upload outcome for a single inbound-composer attachment.
export type InboxUploadOutcome =
  | { ok: true; url: string; kind: OutboundMediaKind; fileName: string }
  | { ok: false; message: string };

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('unreadable'));
        return;
      }
      // result is a data: URL; strip the prefix to a bare base64 string.
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(file);
  });

// Upload a picked / dropped / pasted file to /marketing/media/upload and resolve a
// durable B2 URL. In the REAL frontend we hold the File directly (FileReader →
// base64) — no front-component token RPC like the worker sandbox. `allowDocuments`
// is set because the Inbox attaches contracts/brochures, not just images. The route
// reads `event.body`, so the payload is wrapped (callPropelRoute unwraps a lone
// `{ body }` server-side-as-is, matching the social composer).
export const uploadInboxMedia = async (
  file: File,
): Promise<InboxUploadOutcome> => {
  if (!isAllowedInboxMediaType(file.type)) {
    return {
      ok: false,
      message:
        'That file type can’t be attached. Pick an image, a video, or a document (PDF, Word, Excel, or PowerPoint).',
    };
  }
  if (file.size > MEDIA_MAX_BYTES) {
    const maxMb = Math.floor(MEDIA_MAX_BYTES / (1024 * 1024));
    return {
      ok: false,
      message: `That file is too large (max ${maxMb} MB). Compress or resize it and try again.`,
    };
  }

  let contentBase64: string;
  try {
    contentBase64 = await fileToBase64(file);
  } catch {
    return { ok: false, message: "Couldn't read that file. Try another one." };
  }

  const res = await callPropelRoute<{
    ok?: boolean;
    url?: string;
    contentType?: string;
    error?: string;
    operatorAction?: string;
  }>('/marketing/media/upload', {
    body: {
      filename: file.name,
      contentType: file.type,
      contentBase64,
      allowDocuments: true,
    },
  });

  if (res !== null && res.ok === true && typeof res.url === 'string') {
    return {
      ok: true,
      url: res.url,
      kind: outboundMediaKindFromContentType(res.contentType ?? file.type),
      fileName: file.name,
    };
  }

  const message =
    (res && (res.operatorAction || res.error)) ||
    'Upload failed — try a different file.';
  return { ok: false, message };
};
