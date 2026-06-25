// Route + compose helpers for the unified Inbox hero tab.
//
// All five inbox routes are UNCHANGED from the legacy app-sandbox and read a FLAT
// `event.body` (verified in propel-crm-integration src/logic-functions/marketing-
// inbox-*-route.ts), so callPropelRoute is given a flat payload — never the
// `{ body: {...} }` wrapper the media/social routes need. callPropelRoute returns
// the parsed JSON on 2xx or `null` (network / non-2xx), so every error envelope
// (COMPLIANCE_BLOCK, 24h-window, ENV_MISSING) is preserved, and a transport failure
// is a single `null` the callers map to a clean error state.

import { getTokenPair } from '@/apollo/utils/getTokenPair';
import { REACT_APP_SERVER_BASE_URL } from '~/config';
import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import {
  type ContactClassifyResponse,
  type FindDuplicatesResponse,
  type InboxAgentOption,
  type InboxChannel,
  type InboxPayload,
  type InboxThreadPayload,
  type InboxAiResponse,
  type LeadAssignResponse,
  type LeadCreateOpportunityResponse,
  type LeadEventsResponse,
  type MergeContactResponse,
  type OutboundMediaKind,
  type QuickRepliesPayload,
  type QuickReply,
  type ReplySendEnvelope,
  type SuggestTypeResponse,
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

// POST /inbox/quick-replies — the shared canned-reply library for the composer
// picker. Read-only; no body. Returns [] (never null) so the picker always has a
// concrete list to group/filter; a transport failure renders the empty state.
export const fetchQuickReplies = async (): Promise<QuickReply[]> => {
  const res = await callPropelRoute<QuickRepliesPayload>('/inbox/quick-replies', {});
  return Array.isArray(res?.quickReplies) ? res.quickReplies : [];
};

// ── Lead-triage quick actions (Lead Engine S1) ───────────────────────────────
// GATED routes — the component NEVER mutates a record directly; the route enforces
// policy (manager/admin), performs the write, and emits the leadEvent. Flat body
// (event.body), same convention as the other inbox routes.

// POST /lead/assign — set the lead's owner (person.assignedAgentId) to an agent.
// Starts the SLA clock + first-response task server-side. mode:'noop' when already
// assigned to that agent.
export const assignLead = (args: {
  personId: string;
  agentWorkspaceMemberId: string;
}): Promise<LeadAssignResponse | null> =>
  callPropelRoute<LeadAssignResponse>('/lead/assign', {
    personId: args.personId,
    agentWorkspaceMemberId: args.agentWorkspaceMemberId,
  });

// POST /lead/create-opportunity — create the lane opportunity for this contact and
// emit OPPORTUNITY_CREATED. lane ∈ {secondary, sell, offplan, institutional, rcbi}.
export const createLeadOpportunity = (args: {
  lane: string;
  contactId: string;
  name: string;
}): Promise<LeadCreateOpportunityResponse | null> =>
  callPropelRoute<LeadCreateOpportunityResponse>('/lead/create-opportunity', {
    lane: args.lane,
    contactId: args.contactId,
    name: args.name,
  });

// POST /lead/events — Manager/Admin-gated read of the leadEvent timeline for ONE
// subject (the lead's Person). Returns the append-only history (assigned, responded,
// SLA-breached, opportunity-created, stage-changed, won/lost …), recency-desc. Flat
// body, same convention as the other routes. The route returns NOT_FOUND for an
// AGENT viewer (UI gate, not a confidentiality boundary), so callers gate on role
// before fetching to avoid a guaranteed-empty round-trip.
export const fetchLeadEvents = (args: {
  subjectObjectType: string;
  subjectRecordId: string;
  limit?: number;
}): Promise<LeadEventsResponse | null> =>
  callPropelRoute<LeadEventsResponse>('/lead/events', {
    subjectObjectType: args.subjectObjectType,
    subjectRecordId: args.subjectRecordId,
    ...(typeof args.limit === 'number' ? { limit: args.limit } : {}),
  });

// POST /contact/classify (Phase A) — set the durable who-is-this contact tag, note,
// and/or team-member link on a Person, GATED (never a direct mutation). FLAT body:
// only the keys present here are written, and at least one optional key is required.
// `contactTagNote: null` clears the note; `teamMemberIdentityId: null` unlinks. We
// build the body in the card (omitting untouched keys, passing explicit null to
// clear), so this helper just forwards it. The route returns `{ ok, personId,
// updated }` on success or the shared error envelope (200 body) on failure — the
// caller reads res?.error / res?.operatorAction the same way the /lead/* actions do.
export const classifyContact = (args: {
  personId: string;
  contactType?: string | null;
  contactTagNote?: string | null;
  teamMemberIdentityId?: string | null;
}): Promise<ContactClassifyResponse | null> =>
  callPropelRoute<ContactClassifyResponse>('/contact/classify', {
    personId: args.personId,
    ...('contactType' in args ? { contactType: args.contactType } : {}),
    ...('contactTagNote' in args ? { contactTagNote: args.contactTagNote } : {}),
    ...('teamMemberIdentityId' in args
      ? { teamMemberIdentityId: args.teamMemberIdentityId }
      : {}),
  });

// ── Merge into existing contact (Round 2) ────────────────────────────────────
// POST /contact/find-duplicates — read-only; returns the likely-duplicate Persons of
// this contact (matched on phone/email/metaUserId), ranked, with WHY + a conflict
// preview. The card shows the candidates for the operator to pick before merging.
export const findContactDuplicates = (
  personId: string,
): Promise<FindDuplicatesResponse | null> =>
  callPropelRoute<FindDuplicatesResponse>('/contact/find-duplicates', { personId });

// POST /contact/merge — fold `duplicateId` into `canonicalId` via the engine's native
// mergeManyPeople (relations repointed onto the canonical, canonical wins scalar
// conflicts, duplicate removed). Coordinator-gated server-side. `force` overrides the
// no-shared-axis guard (the UI sends it only after an explicit confirm). Idempotent —
// merged:false when the duplicate is already gone.
export const mergeContact = (args: {
  canonicalId: string;
  duplicateId: string;
  force?: boolean;
}): Promise<MergeContactResponse | null> =>
  callPropelRoute<MergeContactResponse>('/contact/merge', {
    canonicalId: args.canonicalId,
    duplicateId: args.duplicateId,
    ...(args.force ? { force: true } : {}),
  });

// ── AI tag suggestion (Round 2) ──────────────────────────────────────────────
// POST /contact/suggest-type — the LLM's suggested contactType + reason + confidence,
// grounded in the contact's inbound messages + source. Read-only. Degrades to
// suggestion:null (never errors) when the AI env is unset — the card simply shows no
// pill. AI suggests, human confirms (the agent must click to apply).
export const suggestContactType = (
  personId: string,
): Promise<SuggestTypeResponse | null> =>
  callPropelRoute<SuggestTypeResponse>('/contact/suggest-type', { personId });

// Follow-up ping — a deterministic nudge (NOT the substantive reply, NOT the
// on-arrival auto-ack): re-send a short "an agent is on it" line via the existing
// reply route. Labelled distinctly so it's never confused with composing a reply.
export const FOLLOW_UP_PING_TEXT =
  'Just following up — an agent will be with you shortly. Thanks for your patience!';

export const sendFollowUpPing = (
  id: string,
  channel: InboxChannel,
): Promise<ReplySendEnvelope | null> =>
  callPropelRoute<ReplySendEnvelope>('/marketing/inbox-reply', {
    id,
    channel,
    body: FOLLOW_UP_PING_TEXT,
  });

// ── Agent directory (for the assign picker) ──────────────────────────────────
// Read every workspace member (id, display name, availability) over the core
// GraphQL endpoint with the acting member's OWN session token — same thin-fetch
// escape hatch oneOnOneCrm/dialerCrmBridge use (these reads respect propel-rls).
// Returns [] on any failure so the picker shows an honest "no agents" state.
const coreGraphql = async <T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T | null> => {
  const token = getTokenPair()?.accessOrWorkspaceAgnosticToken?.token;
  if (token === undefined || token === '') return null;
  try {
    const response = await fetch(`${REACT_APP_SERVER_BASE_URL}/graphql`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) return null;
    const json = (await response.json()) as { data?: T };
    return json.data ?? null;
  } catch {
    return null;
  }
};

type AgentDirectoryConnection = {
  workspaceMembers?: {
    edges?: {
      node: {
        id: string;
        name?: { firstName?: string | null; lastName?: string | null };
        agentAvailability?: string | null;
      };
    }[];
  };
};

export const listInboxAgents = async (): Promise<InboxAgentOption[]> => {
  const data = await coreGraphql<AgentDirectoryConnection>(
    `query InboxAgentDirectory {
       workspaceMembers(first: 500, orderBy: [{ name: { firstName: AscNullsLast } }]) {
         edges { node { id name { firstName lastName } agentAvailability } }
       }
     }`,
    {},
  );
  const edges = data?.workspaceMembers?.edges ?? [];
  return edges
    .map((e) => ({
      id: e.node.id,
      name:
        [e.node.name?.firstName, e.node.name?.lastName]
          .filter(Boolean)
          .join(' ')
          .trim() || 'Unnamed',
      available: (e.node.agentAvailability ?? 'AVAILABLE') === 'AVAILABLE',
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

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
// Inline JSON path: 7 MB per item — mirrors the server cap (marketing-media.ts
// MEDIA_MAX_DECODED_BYTES, transport-bounded by Twenty's 10 MB JSON body limit).
// Files at or under this size take the fast single-round-trip base64-over-JSON path
// (/marketing/media/upload). Larger files take the presigned-B2 direct path below.
export const INLINE_MEDIA_MAX_BYTES = 7 * 1024 * 1024;

// Direct-to-B2 ceiling — mirrors the server's PRESIGN_MAX_BYTES (100 MB). The hard
// limit for any inbox attachment: covers a large signed contract PDF or a big
// listing walk-through video. Enforced client-side before any round-trip, and again
// server-side at presign time.
export const MEDIA_MAX_BYTES = 100 * 1024 * 1024;

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

// Optional progress callback (0..1). Only the large/presigned path reports real
// byte-progress (XHR upload events); the small inline path is a single round-trip,
// so it reports nothing (the caller shows an indeterminate spinner for it).
export type UploadProgress = (fraction: number) => void;

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

// The frozen presign-route response (see marketing-media-presign-route.ts). The
// durable publicUrl + the uploadUrl/uploadHeaders the browser PUTs the bytes with.
interface PresignResponse {
  ok?: boolean;
  key?: string;
  uploadUrl?: string;
  publicUrl?: string;
  uploadToken?: string;
  encodedKey?: string;
  uploadHeaders?: Record<string, string>;
  error?: string;
  operatorAction?: string;
}

// SMALL path: base64-over-JSON to /marketing/media/upload (one round-trip, ≤7 MB).
// Kept for tiny images so a quick screenshot doesn't pay two extra B2 round-trips.
const uploadInline = async (file: File): Promise<InboxUploadOutcome> => {
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
    (res && (res.operatorAction || res.error)) || 'Upload failed — try a different file.';
  return { ok: false, message };
};

// PUT the raw File bytes straight to the single-use B2 upload URL the presign route
// minted. We use XHR (not fetch) ONLY because fetch exposes no upload-progress event
// — a 100 MB upload needs a real progress bar. Resolves true on a 2xx from B2.
const putBytesToB2 = (
  uploadUrl: string,
  headers: Record<string, string>,
  file: File,
  onProgress?: UploadProgress,
): Promise<boolean> =>
  new Promise((resolve) => {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', uploadUrl, true);
      for (const [k, v] of Object.entries(headers)) {
        // B2 wants the raw bytes; let the browser set Content-Length itself.
        if (k.toLowerCase() === 'content-length') continue;
        xhr.setRequestHeader(k, v);
      }
      if (onProgress) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable && e.total > 0) onProgress(Math.min(1, e.loaded / e.total));
        };
      }
      xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
      xhr.onerror = () => resolve(false);
      xhr.onabort = () => resolve(false);
      xhr.send(file);
    } catch {
      resolve(false);
    }
  });

// LARGE path: presign → direct B2 PUT (no bytes through the Twenty server, so it
// bypasses the 7.5 MB JSON-body ceiling and carries up to 100 MB). The attached
// media is referenced by the durable publicUrl the route returns (the app re-signs
// the b2: pointer on read, or serves the stable media-proxy URL).
const uploadViaPresign = async (
  file: File,
  onProgress?: UploadProgress,
): Promise<InboxUploadOutcome> => {
  const presign = await callPropelRoute<PresignResponse>('/marketing/media/presign', {
    filename: file.name,
    contentType: file.type,
    sizeBytes: file.size,
    scope: 'inbox',
  });
  if (
    presign === null ||
    presign.ok !== true ||
    typeof presign.uploadUrl !== 'string' ||
    typeof presign.publicUrl !== 'string' ||
    !presign.uploadHeaders
  ) {
    const message =
      (presign && (presign.operatorAction || presign.error)) ||
      'Couldn’t start the upload — try again, or use a smaller file.';
    return { ok: false, message };
  }

  const put = await putBytesToB2(presign.uploadUrl, presign.uploadHeaders, file, onProgress);
  if (!put) {
    return {
      ok: false,
      message: 'The file didn’t finish uploading — check your connection and try again.',
    };
  }
  return {
    ok: true,
    url: presign.publicUrl,
    kind: outboundMediaKindFromContentType(file.type),
    fileName: file.name,
  };
};

// Upload a picked / dropped / pasted file and resolve a durable URL for the message.
// DISPATCHES by size: tiny files (≤7 MB) take the fast inline base64 path; anything
// larger takes the presigned-B2 direct path (up to 100 MB), so a big contract or
// video isn't blocked by the JSON-body ceiling. `onProgress` (0..1) is reported only
// on the large path (XHR upload events); the inline path is a single round-trip.
export const uploadInboxMedia = async (
  file: File,
  onProgress?: UploadProgress,
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
      message: `That file is too large (max ${maxMb} MB). Compress or split it and try again.`,
    };
  }
  if (file.size === 0) {
    return { ok: false, message: 'That file is empty — pick another one.' };
  }

  return file.size > INLINE_MEDIA_MAX_BYTES
    ? uploadViaPresign(file, onProgress)
    : uploadInline(file);
};
