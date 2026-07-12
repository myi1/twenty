import { getTokenPair } from '@/apollo/utils/getTokenPair';
import { fetchWithRenewal } from '@/apollo/utils/renewAndRetryFetch';
import { REACT_APP_SERVER_BASE_URL } from '~/config';

// CRM-side data + send layer for the floating WhatsApp dock. Mirrors the
// dialer-dock bridge: every call carries the AGENT'S OWN session token, so
// person lookups respect the agent's record visibility (RLS) exactly like the
// rest of the CRM, and sends are attributed server-side (never a client id).
//
// The dock touches only routes that already exist on the server (all reused
// as-is from the Inbox — no new server code for the redesign):
//   • GraphQL /graphql                 — person search + WhatsApp target resolution
//   • POST /s/marketing/inbox          — unified Inbox list (filtered to WHATSAPP
//                                        client-side) → the dock's "recent chats" rows.
//   • POST /s/marketing/inbox-thread   — one thread's full message history + media +
//                                        24h window state + approved templates.
//   • POST /s/whatsapp/send            — compose mode (no thread yet): { waPhoneNumber, body }
//                                        wa-service find-or-creates the conversation.
//                                        TEXT ONLY — no media param on this route.
//   • POST /s/marketing/inbox-reply    — existing thread: { id, channel:'WHATSAPP', body,
//                                        mediaUrl?, mediaKind?, fileName? }. OFFICIAL line
//                                        + >24h returns { windowClosed:true, suggestedTemplate };
//                                        OFFICIAL also rejects any mediaUrl (attachments/voice
//                                        notes are EVERYDAY-line only — confirmed server-side,
//                                        see marketing-inbox-reply-route.ts).
//   • POST /s/marketing/media/upload   — stores an attachment/voice note to B2, returns a
//                                        signed URL + contentType (composer uploads bytes
//                                        as base64 — the sandbox file-input constraint).
//
// Renew-and-retry: every fetch below goes through fetchWithRenewal, so an
// expired access token no longer means silent empty results forever — see
// modules/apollo/utils/renewAndRetryFetch.ts.

const digitsOf = (value: string): string => value.replace(/\D/g, '');
const normDigits = (value: string): string => digitsOf(value).replace(/^0+/, '');

export type WaPersonResult = {
  id: string;
  name: string;
  callingCode: string;
  national: string;
  /** Digits-only full number (callingCode + national); '' when the person has no phone. */
  e164Digits: string;
};

export type WaTarget = {
  personId: string;
  name: string;
  e164Digits: string;
  /** Newest WhatsApp conversation for this contact, if any. */
  conversationId: string | null;
  lineType: 'EVERYDAY' | 'OFFICIAL' | null;
  lastInboundAt: string | null;
};

export type WaSendOutcome =
  | { ok: true; conversationId?: string }
  // OFFICIAL line, >24h since last inbound: only an approved template may send now.
  | {
      ok: false;
      windowClosed: true;
      suggestedTemplate: { name: string; languageCode: string; preview: string } | null;
      message: string;
    }
  | { ok: false; error: string };

type PersonNode = {
  id: string;
  name?: { firstName?: string | null; lastName?: string | null } | null;
  phones?: {
    primaryPhoneNumber?: string | null;
    primaryPhoneCallingCode?: string | null;
  } | null;
};

type ConversationNode = {
  id: string;
  lineType?: string | null;
  lastInboundAt?: string | null;
  waPhoneNumber?: string | null;
};

const token = (): string | undefined =>
  getTokenPair()?.accessOrWorkspaceAgnosticToken?.token;

const graphql = async <T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T | null> => {
  if (token() === undefined) {
    return null;
  }
  const response = await fetchWithRenewal(() =>
    fetch(`${REACT_APP_SERVER_BASE_URL}/graphql`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token()}`,
      },
      body: JSON.stringify({ query, variables }),
    }),
  );
  if (response === null || !response.ok) {
    return null;
  }
  const json = (await response.json()) as { data?: T };
  return json.data ?? null;
};

const appRoute = async <T>(path: string, body: object): Promise<T | null> => {
  if (token() === undefined) {
    return null;
  }
  const response = await fetchWithRenewal(() =>
    fetch(`${REACT_APP_SERVER_BASE_URL}/s${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token()}`,
      },
      body: JSON.stringify(body),
    }),
  );
  if (response === null || !response.ok) {
    return null;
  }
  return (await response.json()) as T;
};

const personName = (person: PersonNode): string =>
  `${person.name?.firstName ?? ''} ${person.name?.lastName ?? ''}`.trim();

/**
 * Search People by name (first OR last, case-insensitive substring). Returns up
 * to 8 matches with their primary phone split into calling code + national
 * digits — the raw material the compose panel needs to send.
 */
export const searchPeopleByName = async (
  query: string,
): Promise<WaPersonResult[]> => {
  const term = query.trim();
  if (term.length < 2) {
    return [];
  }
  const data = await graphql<{ people?: { edges?: { node: PersonNode }[] } }>(
    `query WaDockPeopleByName($filter: PersonFilterInput) {
       people(filter: $filter, first: 8) {
         edges { node {
           id
           name { firstName lastName }
           phones { primaryPhoneNumber primaryPhoneCallingCode }
         } }
       }
     }`,
    {
      filter: {
        or: [
          { name: { firstName: { ilike: `%${term}%` } } },
          { name: { lastName: { ilike: `%${term}%` } } },
        ],
      },
    },
  );
  return (data?.people?.edges ?? []).map((edge) => {
    const node = edge.node;
    const callingCode = node.phones?.primaryPhoneCallingCode ?? '';
    const national = node.phones?.primaryPhoneNumber ?? '';
    return {
      id: node.id,
      name: personName(node) || 'Unnamed contact',
      callingCode,
      national,
      e164Digits: national ? digitsOf(`${callingCode}${national}`) : '',
    };
  });
};

/**
 * Resolve the best WhatsApp target for a picked person: their number plus the
 * NEWEST WhatsApp conversation (matched by phone-digit tail, most recent
 * lastMessageAt first) so the send can ride an existing thread (which carries
 * the line type + 24h-window state) when one exists.
 */
export const resolveWaTarget = async (
  person: WaPersonResult,
): Promise<WaTarget> => {
  const base: WaTarget = {
    personId: person.id,
    name: person.name,
    e164Digits: person.e164Digits,
    conversationId: null,
    lineType: null,
    lastInboundAt: null,
  };
  if (person.e164Digits.length < 5) {
    return base;
  }
  const target = normDigits(person.e164Digits);
  const data = await graphql<{
    whatsAppConversations?: { edges?: { node: ConversationNode }[] };
  }>(
    `query WaDockConversationByPhone($filter: WhatsAppConversationFilterInput) {
       whatsAppConversations(filter: $filter, first: 10) {
         edges { node { id lineType lastInboundAt waPhoneNumber } }
       }
     }`,
    { filter: { waPhoneNumber: { ilike: `%${person.e164Digits.slice(-7)}%` } } },
  );
  // Exact match only. A loose "shared 8+ digit suffix" fallback used to live
  // here, intended to tolerate storage-format drift (leading zeros, missing
  // country code) — but normDigits() already normalizes both sides for that,
  // and the loose fallback could wrongly resolve a genuinely NEW contact onto
  // an unrelated EXISTING conversation whose number happens to share a long
  // digit tail (e.g. two numbers differing only in country/area code). That
  // would silently reroute a "first message to a new contact" send into a
  // stranger's real thread — worth hardening even though it wasn't confirmed
  // as this round's reported symptom.
  const match = (data?.whatsAppConversations?.edges ?? [])
    .map((edge) => edge.node)
    .filter((node) => normDigits(node.waPhoneNumber ?? '') === target)
    .sort(
      (a, b) =>
        new Date(b.lastInboundAt ?? 0).getTime() -
        new Date(a.lastInboundAt ?? 0).getTime(),
    )[0];
  if (match === undefined) {
    return base;
  }
  return {
    ...base,
    conversationId: match.id,
    lineType: match.lineType === 'OFFICIAL' ? 'OFFICIAL' : 'EVERYDAY',
    lastInboundAt: match.lastInboundAt ?? null,
  };
};

const errorFrom = (raw: unknown, fallback: string): string => {
  if (raw && typeof raw === 'object' && 'error' in raw) {
    const value = (raw as { error?: unknown }).error;
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return fallback;
};

/**
 * Send a free-text WhatsApp message to a resolved target.
 *   • existing thread → /marketing/inbox-reply (handles EVERYDAY + OFFICIAL, and
 *     surfaces windowClosed + suggestedTemplate on the OFFICIAL >24h case);
 *   • no thread yet   → /whatsapp/send compose mode (EVERYDAY line, find-or-create).
 * Attribution is server-derived from the session token in both cases.
 */
export const sendWaText = async (
  target: WaTarget,
  text: string,
): Promise<WaSendOutcome> => {
  const body = text.trim();
  if (!body) {
    return { ok: false, error: 'Type a message first.' };
  }
  if (target.conversationId) {
    const res = await appRoute<Record<string, unknown>>('/marketing/inbox-reply', {
      id: target.conversationId,
      channel: 'WHATSAPP',
      body,
    });
    if (res === null) {
      return { ok: false, error: 'Could not reach WhatsApp. Try again.' };
    }
    if ((res as { windowClosed?: boolean }).windowClosed === true) {
      const suggested = (res as {
        suggestedTemplate?: { name: string; languageCode: string; preview: string } | null;
      }).suggestedTemplate ?? null;
      return {
        ok: false,
        windowClosed: true,
        suggestedTemplate: suggested,
        message:
          (res as { message?: string }).message ??
          'It has been over 24 hours since their last message, so WhatsApp only allows an approved template now.',
      };
    }
    if ((res as { ok?: boolean }).ok === true) {
      return { ok: true, conversationId: target.conversationId };
    }
    return { ok: false, error: errorFrom(res, 'WhatsApp could not send this message.') };
  }
  // No thread yet → compose mode. wa-service resolves/creates the conversation.
  if (target.e164Digits.length < 5) {
    return { ok: false, error: 'This contact has no WhatsApp number on file.' };
  }
  const res = await appRoute<Record<string, unknown>>('/whatsapp/send', {
    waPhoneNumber: `+${target.e164Digits}`,
    body,
  });
  if (res === null) {
    return { ok: false, error: 'Could not reach WhatsApp. Try again.' };
  }
  const kind = (res as { kind?: string; result?: { kind?: string } }).kind ??
    (res as { result?: { kind?: string } }).result?.kind;
  if (kind === 'REJECTED') {
    return { ok: false, error: 'WhatsApp declined this send. The number may not be on WhatsApp.' };
  }
  if ('error' in (res as object)) {
    return { ok: false, error: errorFrom(res, 'WhatsApp could not send this message.') };
  }
  const conversationId =
    (res as { conversationId?: string }).conversationId ??
    (res as { result?: { conversationId?: string } }).result?.conversationId;
  return { ok: true, ...(conversationId ? { conversationId } : {}) };
};

/**
 * Send an approved template into an existing OFFICIAL thread (the >24h path).
 * Only valid when the target already has a conversation.
 */
export const sendWaTemplate = async (
  target: WaTarget,
  templateName: string,
): Promise<WaSendOutcome> => {
  if (!target.conversationId) {
    return { ok: false, error: 'No conversation to send a template into.' };
  }
  const res = await appRoute<Record<string, unknown>>('/marketing/inbox-reply', {
    id: target.conversationId,
    channel: 'WHATSAPP',
    templateName,
  });
  if (res === null) {
    return { ok: false, error: 'Could not reach WhatsApp. Try again.' };
  }
  if ((res as { ok?: boolean }).ok === true) {
    return { ok: true, conversationId: target.conversationId };
  }
  return { ok: false, error: errorFrom(res, 'That template could not be sent.') };
};

// ── Recent chats (list view) ─────────────────────────────────────────────────
// Reuses the SAME unified-Inbox list route the Inbox hero calls
// (POST /marketing/inbox) and keeps only the WhatsApp rows — no new server
// code, and the route already does the agent/pool visibility scoping.

export type WaChatRow = {
  id: string; // whatsAppConversation id
  personId: string | null;
  title: string; // contact name (or phone, server-derived)
  preview: string; // last message body, trimmed
  whenLabel: string; // "14m ago" — server-derived, never re-computed here
  lastAtMs: number;
  unreadCount: number;
  lineType: 'EVERYDAY' | 'OFFICIAL';
};

type RawInboxThreadRow = {
  id?: string;
  channel?: string;
  lineType?: string;
  title?: string;
  preview?: string;
  whenLabel?: string;
  lastAtMs?: number;
  unreadCount?: number;
  personId?: string | null;
};

/** Recent WhatsApp threads, most-recent first — the list view's top section. */
export const fetchRecentWaChats = async (): Promise<WaChatRow[]> => {
  const res = await appRoute<{ threads?: RawInboxThreadRow[] }>('/marketing/inbox', {});
  const threads = res?.threads ?? [];
  return threads
    .filter((row) => row.channel === 'WHATSAPP' && typeof row.id === 'string')
    .map(
      (row): WaChatRow => ({
        id: row.id as string,
        personId: row.personId ?? null,
        title: row.title || 'WhatsApp contact',
        preview: row.preview ?? '',
        whenLabel: row.whenLabel ?? '',
        lastAtMs: typeof row.lastAtMs === 'number' ? row.lastAtMs : 0,
        unreadCount: typeof row.unreadCount === 'number' ? row.unreadCount : 0,
        lineType: row.lineType === 'OFFICIAL' ? 'OFFICIAL' : 'EVERYDAY',
      }),
    )
    .sort((a, b) => b.lastAtMs - a.lastAtMs);
};

// ── Conversation view (thread history) ───────────────────────────────────────
// Reuses the SAME thread route the Inbox uses (POST /marketing/inbox-thread) —
// full message history, media, the 24h window state, and the approved
// template list all come back in one call; the dock adds no server logic.

export type WaMediaKind = 'NONE' | 'IMAGE' | 'AUDIO' | 'VIDEO' | 'DOCUMENT' | 'STICKER';
export type OutboundWaMediaKind = 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT';

export type WaMessage = {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  body: string;
  whenLabel: string;
  sentAtMs: number;
  mediaUrl: string | null;
  mediaKind: WaMediaKind;
};

export type WaApprovedTemplate = { name: string; languageCode: string; preview: string };

export type WaThread = {
  ok: boolean;
  id: string;
  title: string;
  personId: string | null;
  lineType: 'EVERYDAY' | 'OFFICIAL';
  canReply: boolean;
  replyHint: string;
  sessionWindowOpen: boolean;
  sessionWindowEndsAtMs: number | null;
  suggestedTemplate: WaApprovedTemplate | null;
  approvedTemplates: WaApprovedTemplate[];
  messages: WaMessage[];
  error: string | null;
};

const EMPTY_THREAD = (id: string, error: string): WaThread => ({
  ok: false,
  id,
  title: '',
  personId: null,
  lineType: 'EVERYDAY',
  canReply: false,
  replyHint: error,
  sessionWindowOpen: true,
  sessionWindowEndsAtMs: null,
  suggestedTemplate: null,
  approvedTemplates: [],
  messages: [],
  error,
});

export const fetchWaThread = async (conversationId: string): Promise<WaThread> => {
  const res = await appRoute<Record<string, unknown>>('/marketing/inbox-thread', {
    id: conversationId,
    channel: 'WHATSAPP',
  });
  if (res === null) {
    return EMPTY_THREAD(conversationId, 'Could not reach WhatsApp. Try again.');
  }
  if (res.ok !== true) {
    return EMPTY_THREAD(conversationId, errorFrom(res, 'This conversation could not be opened.'));
  }
  const rawMessages = Array.isArray(res.messages) ? (res.messages as Record<string, unknown>[]) : [];
  return {
    ok: true,
    id: conversationId,
    title: (res.title as string) || (res.contactName as string) || 'WhatsApp',
    personId: (res.personId as string | null) ?? null,
    lineType: res.lineType === 'OFFICIAL' ? 'OFFICIAL' : 'EVERYDAY',
    canReply: res.canReply === true,
    replyHint: (res.replyHint as string) ?? '',
    sessionWindowOpen: res.sessionWindowOpen !== false,
    sessionWindowEndsAtMs:
      typeof res.sessionWindowEndsAtMs === 'number' ? res.sessionWindowEndsAtMs : null,
    suggestedTemplate: (res.suggestedTemplate as WaApprovedTemplate | null) ?? null,
    approvedTemplates: Array.isArray(res.approvedTemplates)
      ? (res.approvedTemplates as WaApprovedTemplate[])
      : [],
    messages: rawMessages.map((m) => ({
      id: (m.id as string) ?? '',
      direction: m.direction === 'OUTBOUND' ? 'OUTBOUND' : 'INBOUND',
      body: (m.body as string) ?? '',
      whenLabel: (m.whenLabel as string) ?? '',
      sentAtMs: typeof m.sentAtMs === 'number' ? m.sentAtMs : 0,
      mediaUrl: (m.mediaUrl as string | null) ?? null,
      mediaKind: (m.mediaKind as WaMediaKind) ?? 'NONE',
    })),
    error: null,
  };
};

// ── Attachments / voice notes ────────────────────────────────────────────────
// Reuses the SAME upload route the Inbox composer uses
// (POST /marketing/media/upload) — stores the bytes to B2, returns a signed
// URL. allowDocuments:true so the dock can attach files, not just images/video
// (the social composer's default is image/video only).

export type WaUploadOutcome =
  | { ok: true; url: string; contentType: string }
  | { ok: false; error: string };

const base64OfFile = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      // reader.result is a data: URL ("data:<type>;base64,<payload>") — the
      // upload route accepts either a bare base64 string or a full data URL,
      // so passing it straight through is fine.
      resolve(result);
    };
    reader.readAsDataURL(file);
  });

export const uploadWaMedia = async (file: File): Promise<WaUploadOutcome> => {
  let contentBase64: string;
  try {
    contentBase64 = await base64OfFile(file);
  } catch {
    return { ok: false, error: 'Could not read the file.' };
  }
  const res = await appRoute<Record<string, unknown>>('/marketing/media/upload', {
    filename: file.name,
    contentType: file.type || 'application/octet-stream',
    contentBase64,
    allowDocuments: true,
  });
  if (res === null) {
    return { ok: false, error: 'Could not reach the upload service. Try again.' };
  }
  if (res.ok === true && typeof res.url === 'string') {
    return { ok: true, url: res.url, contentType: (res.contentType as string) ?? file.type };
  }
  return { ok: false, error: errorFrom(res, 'That file could not be uploaded.') };
};

/** Derive the outbound media kind from a File's content-type (mirrors the server's
 * mediaKindFromContentType so the composer picks the same bucket the route expects). */
export const outboundKindFromFile = (file: File): OutboundWaMediaKind => {
  const type = file.type || '';
  if (/^image\//i.test(type)) return 'IMAGE';
  if (/^video\//i.test(type)) return 'VIDEO';
  if (/^audio\//i.test(type)) return 'AUDIO';
  return 'DOCUMENT';
};

/**
 * Send an attachment (image/video/document) or a voice note (audio) into an
 * EXISTING thread. Attachments only ride the reply route (not the compose
 * /whatsapp/send route, which is text-only) — so a target with no
 * conversation yet cannot attach until a first text message creates one.
 * OFFICIAL-line threads reject media server-side (confirmed:
 * marketing-inbox-reply-route.ts — "Attachments aren't supported on the
 * campaign number yet") — that rejection surfaces here as a normal error,
 * never a fake success.
 */
export const sendWaMedia = async (
  target: WaTarget,
  media: { url: string; kind: OutboundWaMediaKind; fileName: string },
  caption: string,
): Promise<WaSendOutcome> => {
  if (!target.conversationId) {
    return {
      ok: false,
      error: 'Send a text message first to start this chat, then you can attach files.',
    };
  }
  const res = await appRoute<Record<string, unknown>>('/marketing/inbox-reply', {
    id: target.conversationId,
    channel: 'WHATSAPP',
    body: caption.trim(),
    mediaUrl: media.url,
    mediaKind: media.kind,
    fileName: media.fileName,
  });
  if (res === null) {
    return { ok: false, error: 'Could not reach WhatsApp. Try again.' };
  }
  if ((res as { windowClosed?: boolean }).windowClosed === true) {
    const suggested = (res as {
      suggestedTemplate?: { name: string; languageCode: string; preview: string } | null;
    }).suggestedTemplate ?? null;
    return {
      ok: false,
      windowClosed: true,
      suggestedTemplate: suggested,
      message:
        (res as { message?: string }).message ??
        'It has been over 24 hours since their last message, so WhatsApp only allows an approved template now.',
    };
  }
  if ((res as { ok?: boolean }).ok === true) {
    return { ok: true, conversationId: target.conversationId };
  }
  return { ok: false, error: errorFrom(res, 'That attachment could not be sent.') };
};
