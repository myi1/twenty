import { getTokenPair } from '@/apollo/utils/getTokenPair';
import { REACT_APP_SERVER_BASE_URL } from '~/config';

// CRM-side data + send layer for the floating WhatsApp dock. Mirrors the
// dialer-dock bridge: every call carries the AGENT'S OWN session token, so
// person lookups respect the agent's record visibility (RLS) exactly like the
// rest of the CRM, and sends are attributed server-side (never a client id).
//
// The dock touches only routes that already exist on the server:
//   • GraphQL /graphql            — person search + WhatsApp target resolution
//   • POST   /s/whatsapp/send     — compose mode (no thread yet): { waPhoneNumber, body }
//                                   wa-service find-or-creates the conversation.
//   • POST   /s/marketing/inbox-reply — existing thread: { id, channel:'WHATSAPP', body }
//                                   OFFICIAL line + >24h returns { windowClosed:true,
//                                   suggestedTemplate } so the dock can offer the
//                                   approved template; then { id, ..., templateName }.

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
  const t = token();
  if (t === undefined) {
    return null;
  }
  try {
    const response = await fetch(`${REACT_APP_SERVER_BASE_URL}/graphql`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${t}` },
      body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) {
      return null;
    }
    const json = (await response.json()) as { data?: T };
    return json.data ?? null;
  } catch {
    return null;
  }
};

const appRoute = async <T>(path: string, body: object): Promise<T | null> => {
  const t = token();
  if (t === undefined) {
    return null;
  }
  try {
    const response = await fetch(`${REACT_APP_SERVER_BASE_URL}/s${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${t}` },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as T;
  } catch {
    return null;
  }
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
  const match = (data?.whatsAppConversations?.edges ?? [])
    .map((edge) => edge.node)
    .filter((node) => {
      const candidate = normDigits(node.waPhoneNumber ?? '');
      if (candidate.length === 0) {
        return false;
      }
      if (candidate === target) {
        return true;
      }
      const shorter = Math.min(candidate.length, target.length);
      return shorter >= 8 && (candidate.endsWith(target) || target.endsWith(candidate));
    })
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
