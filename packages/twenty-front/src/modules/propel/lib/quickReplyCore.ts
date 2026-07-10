// Fork-local PORT of the canned-reply merge-tag helpers
// (propel-crm-integration: src/shared/quick-reply-core.ts). Pure, React-free.
//
// The composer mirrors the server's merge-tag resolver at INSERT time: a canned
// reply body may carry a CLOSED set of {{tags}} that personalize from the current
// conversation's contact/agent context. An unknown/unfilled tag is left LITERAL (the
// agent fills it manually) — we never silently blank a token. Keep in lockstep with
// the server module.

import { type QuickReply, type QuickReplyScope } from '@/propel/types/inbox';

// The CLOSED allowed merge-tag set for canned replies (spec A1) — deliberately
// narrower than the campaign catalog: only the recipient's name, the agent's name,
// and the office name make sense on a 1:1 message.
export const CANNED_MERGE_TAGS = ['firstName', 'fullName', 'agentName', 'officeName'] as const;
export type CannedMergeTag = (typeof CANNED_MERGE_TAGS)[number];

const MERGE_TAG_SET: ReadonlySet<string> = new Set(CANNED_MERGE_TAGS);

// Slash-shortcut: lowercase alnum + hyphen, 2–24 chars (mirrors SHORTCUT_RE server).
export const SHORTCUT_RE = /^[a-z0-9-]{2,24}$/;

// Body length cap (mirrors BODY_MAX server-side).
export const BODY_MAX = 2000;

// Match {{ tag }} allowing surrounding whitespace inside the braces.
const TAG_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export type CannedMergeValues = Partial<Record<CannedMergeTag, string | null | undefined>>;

// Every {{token}} that appears in a body (deduped, first-seen order).
export const extractMergeTags = (body: string): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of body.matchAll(TAG_RE)) {
    const tag = m[1];
    if (!seen.has(tag)) {
      seen.add(tag);
      out.push(tag);
    }
  }
  return out;
};

// The tokens in `body` NOT in the allowed set (the reject list at save time).
export const findUnknownMergeTags = (body: string): string[] =>
  extractMergeTags(body).filter((t) => !MERGE_TAG_SET.has(t));

// Substitute known tags from `values`. A tag with no provided value (or an unknown
// tag) is left as the literal `{{tag}}` — same contract as the server resolver.
export const resolveMergeTags = (body: string, values: CannedMergeValues): string =>
  body.replace(TAG_RE, (whole, rawTag: string) => {
    const tag = rawTag as CannedMergeTag;
    if (!MERGE_TAG_SET.has(tag)) return whole;
    const v = values[tag];
    return typeof v === 'string' && v.trim() !== '' ? v : whole;
  });

// True iff the resolved body still contains an allowed {{tag}} the agent must fill
// (used to focus/nudge after insert). Ignores unknown tokens (they stay literal but
// aren't "our" placeholders).
export const hasUnfilledMergeTag = (body: string): boolean =>
  extractMergeTags(body).some((t) => MERGE_TAG_SET.has(t));

// ── `/` shortcut trigger ─────────────────────────────────────────────────────
// The composer opens the picker when the WHOLE draft is a bare `/token` (the agent
// is typing a command). Returns the token (may be '') when in slash mode, or null.
export const parseSlashCommand = (text: string): string | null => {
  const m = /^\/([a-z0-9-]*)$/i.exec(text);
  return m ? m[1].toLowerCase() : null;
};

// Filter the library for the picker. In slash mode we match the `/token` against the
// `shortcut` PREFIX (falling back to title). In free mode we substring-match
// title + body. Always case-insensitive.
export const filterQuickReplies = (
  items: QuickReply[],
  query: string,
  mode: 'slash' | 'free',
): QuickReply[] => {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  if (mode === 'slash') {
    return items.filter(
      (r) =>
        (r.shortcut && r.shortcut.toLowerCase().startsWith(q)) ||
        r.title.toLowerCase().includes(q),
    );
  }
  return items.filter(
    (r) =>
      r.title.toLowerCase().includes(q) ||
      r.body.toLowerCase().includes(q) ||
      (r.shortcut ? r.shortcut.toLowerCase().includes(q) : false),
  );
};

// Group the (already-filtered) items by category (blank → "General"), preserving
// first-seen category order.
export const groupByCategory = (items: QuickReply[]): [string, QuickReply[]][] => {
  const m = new Map<string, QuickReply[]>();
  for (const r of items) {
    const cat = r.category || 'General';
    const arr = m.get(cat) ?? [];
    arr.push(r);
    m.set(cat, arr);
  }
  return Array.from(m.entries());
};

// Can the caller manage this row? Everyone manages their OWN personal rows; only a
// shared-editor (Manager/Admin) manages SHARED rows.
export const canManageQuickReply = (
  row: { scope: QuickReplyScope; ownerMemberId: string | null },
  actingMemberId: string,
  canEditShared: boolean,
): boolean => {
  if (row.scope === 'SHARED') return canEditShared;
  return !!row.ownerMemberId && row.ownerMemberId === actingMemberId;
};

// Client-side pre-validation for the save form (the server re-validates). Returns a
// human reason or null when ok.
export const validateQuickReplyForm = (input: {
  title: string;
  body: string;
  shortcut: string;
}): string | null => {
  if (!input.title.trim()) return 'Give this reply a short title.';
  const body = input.body.trim();
  if (!body) return 'The message body can’t be empty.';
  if (body.length > BODY_MAX) return `The message is too long (max ${BODY_MAX} characters).`;
  const unknown = findUnknownMergeTags(body);
  if (unknown.length) {
    return `Unknown merge tag${unknown.length > 1 ? 's' : ''} ${unknown
      .map((t) => `{{${t}}}`)
      .join(', ')}. Allowed: ${CANNED_MERGE_TAGS.map((t) => `{{${t}}}`).join(', ')}.`;
  }
  const s = input.shortcut.trim().toLowerCase();
  if (s && !SHORTCUT_RE.test(s)) {
    return 'A shortcut must be 2–24 lowercase letters, numbers, or hyphens.';
  }
  return null;
};
