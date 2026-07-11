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
  type InboxAgentOption,
  type InboxChannel,
  type InboxPayload,
  type InboxThreadPayload,
  type InboxAiResponse,
  type LeadAssignResponse,
  type LeadCreateOpportunityResponse,
  type InboxConvertLeadResponse,
  type LeadEventsResponse,
  type OutboundMediaKind,
  type QuickRepliesPayload,
  type QuickReply,
  type QuickReplyLibrary,
  type QuickReplyScope,
  type QuickReplyLanguage,
  type QuickReplySaveResponse,
  type QuickReplyMutationResponse,
  type QuickReplySeedResponse,
  type InboxStatusAction,
  type InboxStatusResponse,
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

// POST /inbox/quick-replies — the canned-reply library for the composer picker
// (TM#91). Returns SHARED rows + the caller's OWN personal rows, plus canEditShared
// (Manager/Admin). Read-only; no body. Always resolves a concrete library (never
// null) so the picker has a list to group/filter; a transport failure → empty.
export const fetchQuickReplyLibrary = async (): Promise<QuickReplyLibrary> => {
  const res = await callPropelRoute<QuickRepliesPayload>('/inbox/quick-replies', {});
  return {
    items: Array.isArray(res?.quickReplies) ? res.quickReplies : [],
    canEditShared: res?.canEditShared === true,
  };
};

// POST /inbox/quick-replies/save — create (no id) or update (id) a quick reply. The
// server re-validates scope gating, shortcut regex/uniqueness, body length, and the
// merge-tag whitelist; PERSONAL rows are stamped with the acting member server-side.
export const saveQuickReply = (input: {
  id?: string | null;
  title: string;
  body: string;
  category?: string | null;
  languageCode: QuickReplyLanguage;
  scope: QuickReplyScope;
  shortcut?: string | null;
  sortOrder?: number | null;
  isActive?: boolean;
}): Promise<QuickReplySaveResponse | null> =>
  callPropelRoute<QuickReplySaveResponse>('/inbox/quick-replies/save', {
    body: {
      ...(input.id ? { id: input.id } : {}),
      title: input.title,
      body: input.body,
      category: input.category ?? null,
      languageCode: input.languageCode,
      scope: input.scope,
      shortcut: input.shortcut ?? null,
      ...(typeof input.sortOrder === 'number' ? { sortOrder: input.sortOrder } : {}),
      ...(typeof input.isActive === 'boolean' ? { isActive: input.isActive } : {}),
    },
  });

// POST /inbox/quick-replies/delete — delete a quick reply by id (owner/manager
// gated server-side).
export const deleteQuickReply = (
  id: string,
): Promise<QuickReplyMutationResponse | null> =>
  callPropelRoute<QuickReplyMutationResponse>('/inbox/quick-replies/delete', {
    body: { id },
  });

// POST /inbox/quick-replies/seed — idempotent starter-pack seed (Manager/Admin).
// Called once post-deploy to populate the EN+AR staples.
export const seedQuickReplies = (): Promise<QuickReplySeedResponse | null> =>
  callPropelRoute<QuickReplySeedResponse>('/inbox/quick-replies/seed', {});

// POST /marketing/inbox-status — set a thread's status (TM#92): done→RESOLVED,
// reopen→OPEN, snooze→SNOOZED+snoozeUntil. Owner-scoped server-side. Flat body
// (event.body), same convention as the other inbox routes.
export const setInboxStatus = (args: {
  id: string;
  channel: InboxChannel;
  action: InboxStatusAction;
  snoozeUntil?: string | null;
}): Promise<InboxStatusResponse | null> =>
  callPropelRoute<InboxStatusResponse>('/marketing/inbox-status', {
    id: args.id,
    channel: args.channel,
    action: args.action,
    ...(args.action === 'snooze' && args.snoozeUntil
      ? { snoozeUntil: args.snoozeUntil }
      : {}),
  });

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

// POST /marketing/inbox/convert-lead — comment-inbox-gate (founder decision
// 2026-07-11): comments create Inbox triage items only; a lead (Person via
// metaUserId dedup + Secondary Opportunity + FOLLOW_UP Task) is born ONLY when a
// human clicks Convert on an FB/IG thread. Idempotent server-side: converting the
// same person from the same post again returns the existing opportunity
// (alreadyConverted=true). Flat body, same convention as the other inbox routes.
export const convertCommentThread = (args: {
  conversationId: string;
}): Promise<InboxConvertLeadResponse | null> =>
  callPropelRoute<InboxConvertLeadResponse>('/marketing/inbox/convert-lead', {
    conversationId: args.conversationId,
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
// `endpoint` selects the GraphQL surface: '/graphql' is the core DATA schema
// (workspace records — workspaceMembers, etc.); '/metadata' is the METADATA schema,
// which is where `currentUser` / `currentWorkspace` live (NOT on /graphql — verified
// on staging: querying them on /graphql errors "Cannot query field currentUser").
const coreGraphql = async <T>(
  query: string,
  variables: Record<string, unknown>,
  endpoint: '/graphql' | '/metadata' = '/graphql',
): Promise<T | null> => {
  const token = getTokenPair()?.accessOrWorkspaceAgnosticToken?.token;
  if (token === undefined || token === '') return null;
  try {
    const response = await fetch(`${REACT_APP_SERVER_BASE_URL}${endpoint}`, {
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

// The acting viewer's identity for canned-reply merge tags ({{agentName}} /
// {{officeName}}) + the quick-reply manager's owner gate. Fetched over the core
// GraphQL endpoint with the session token — the SAME in-hero-proven path as
// listInboxAgents (the jotai auth-state atoms are bundled per-hero and read empty,
// so we never depend on them here). Degrades to blanks on any failure (tags then
// stay literal, per the merge-tag contract).
export interface ViewerContext {
  memberId: string;
  agentName: string;
  officeName: string;
}

type ViewerContextData = {
  currentUser?: {
    id?: string;
    workspaceMember?: {
      id?: string;
      name?: { firstName?: string | null; lastName?: string | null } | null;
    } | null;
  } | null;
  currentWorkspace?: { displayName?: string | null } | null;
};

export const fetchViewerContext = async (): Promise<ViewerContext> => {
  const data = await coreGraphql<ViewerContextData>(
    `query PropelInboxViewerContext {
       currentUser {
         id
         workspaceMember { id name { firstName lastName } }
       }
       currentWorkspace { id displayName }
     }`,
    {},
    '/metadata',
  );
  const wm = data?.currentUser?.workspaceMember ?? null;
  const agentName =
    [wm?.name?.firstName, wm?.name?.lastName].filter(Boolean).join(' ').trim() || '';
  return {
    memberId: wm?.id ?? '',
    agentName,
    officeName: (data?.currentWorkspace?.displayName ?? '').trim(),
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
