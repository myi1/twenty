import { callPropelRoute } from '@/propel/lib/callPropelRoute';

// Data layer for the Source Materials library (Sources SRC-1 / plan SM2). All
// sourceMaterial CRUD + ingestion runs through ONE Manager/Admin-gated CRM route
// (propel-crm-integration, src/logic-functions/source-materials-route.ts):
//
//   POST /website/source-materials  body { action, ... }   (FLAT body — the gotcha)
//     action:'create'    + {kind, name, text, tags?, projectName?}   → { ok, id }
//     action:'ingestUrl' + {url, tags?}                              → { ok, id }
//                          → { ok:false, code:'BAD_SOURCE'|'FETCH_FAILED' }
//     action:'list'      + {query?}   (cap 200, newest first)        → { ok, sources }
//     action:'get'       + {id}       (incl. extractedText)          → { ok, source }
//     action:'update'    + {id, patch:{name?,tags?,projectName?}}    → { ok, id }
//     action:'delete'    + {id}                                      → { ok }
//
// callPropelRoute sends the CRM session token; identity + role are derived
// server-side and the route fails CLOSED (NOT_FOUND) for a non-Manager. It returns
// the parsed 2xx body, or null (non-2xx / network / not signed in / route not
// deployed). A gated/bad-input envelope answers 200 with { ok:false, code, ... },
// so we narrow on body shape and hand callers a discriminated result — never a
// fake-empty success. Mirrors websiteAssetsCrm.ts verbatim.

const ROUTE = '/website/source-materials';

// The source kinds (UPPER_CASE — matches the SM1 SELECT enum values). v1 quick-add
// produces PASTE / FILE_MD / FILE_HTML / FILE_TXT / URL; PDF/DOCX/GDOC arrive with
// the SRC-3 extractors but the enum is already carried so rows never mis-render.
export type SourceKind =
  | 'PASTE'
  | 'FILE_MD'
  | 'FILE_HTML'
  | 'FILE_TXT'
  | 'FILE_PDF'
  | 'FILE_DOCX'
  | 'URL'
  | 'GDOC';

export type SourceStatus = 'READY' | 'PENDING' | 'FAILED';

// One source row (list projection — extractedText intentionally omitted; fetch it
// per-source via getSource so the list stays light).
export interface SourceMaterial {
  id: string;
  name: string;
  kind: SourceKind;
  rawRef: string;
  status: SourceStatus;
  tags: string;
  projectName: string;
  charCount: number;
}

// Full record (preview drawer) — adds the bench-consumable text.
export interface SourceMaterialFull extends SourceMaterial {
  extractedText: string;
}

export interface CreateSourceInput {
  kind: SourceKind;
  name: string;
  text: string;
  tags?: string;
  projectName?: string;
}

export interface UpdateSourcePatch {
  name?: string;
  tags?: string;
  projectName?: string;
}

export type CrmResult<T> = { ok: true; data: T } | { ok: false; error: string };

type Envelope = { ok?: boolean; error?: string; code?: string } & Record<string, unknown>;

const failMessage = (body: Envelope | null): string => {
  if (body === null) {
    return 'Could not reach the source library (sign in as a Manager; the object may not be deployed yet).';
  }
  return typeof body.error === 'string' && body.error ? body.error : 'Request failed.';
};

const KINDS: SourceKind[] = [
  'PASTE',
  'FILE_MD',
  'FILE_HTML',
  'FILE_TXT',
  'FILE_PDF',
  'FILE_DOCX',
  'URL',
  'GDOC',
];

const asKind = (v: unknown): SourceKind =>
  KINDS.includes(v as SourceKind) ? (v as SourceKind) : 'PASTE';

const asStatus = (v: unknown): SourceStatus =>
  v === 'PENDING' || v === 'FAILED' ? v : 'READY';

const parseSource = (raw: unknown): SourceMaterial | null => {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || r.id === '') return null;
  return {
    id: r.id,
    name: typeof r.name === 'string' ? r.name : '',
    kind: asKind(r.kind),
    rawRef: typeof r.rawRef === 'string' ? r.rawRef : '',
    status: asStatus(r.status),
    tags: typeof r.tags === 'string' ? r.tags : '',
    projectName: typeof r.projectName === 'string' ? r.projectName : '',
    charCount: typeof r.charCount === 'number' ? r.charCount : 0,
  };
};

export async function listSources(query?: string): Promise<CrmResult<SourceMaterial[]>> {
  const body = await callPropelRoute<Envelope>(ROUTE, {
    action: 'list',
    ...(query && query.trim() !== '' ? { query: query.trim() } : {}),
  });
  if (body && body.ok === true && Array.isArray(body.sources)) {
    return {
      ok: true,
      data: body.sources
        .map(parseSource)
        .filter((s): s is SourceMaterial => s !== null),
    };
  }
  return { ok: false, error: failMessage(body) };
}

export async function getSource(id: string): Promise<CrmResult<SourceMaterialFull>> {
  const body = await callPropelRoute<Envelope>(ROUTE, { action: 'get', id });
  if (body && body.ok === true) {
    const base = parseSource(body.source);
    if (base !== null) {
      const raw = body.source as Record<string, unknown>;
      return {
        ok: true,
        data: {
          ...base,
          extractedText: typeof raw.extractedText === 'string' ? raw.extractedText : '',
        },
      };
    }
  }
  return { ok: false, error: failMessage(body) };
}

export async function createSource(
  input: CreateSourceInput,
): Promise<CrmResult<{ id: string }>> {
  const body = await callPropelRoute<Envelope>(ROUTE, {
    action: 'create',
    kind: input.kind,
    name: input.name,
    text: input.text,
    ...(input.tags ? { tags: input.tags } : {}),
    ...(input.projectName ? { projectName: input.projectName } : {}),
  });
  if (body && body.ok === true && typeof body.id === 'string') {
    return { ok: true, data: { id: body.id } };
  }
  return { ok: false, error: failMessage(body) };
}

export async function ingestUrl(
  url: string,
  tags?: string,
): Promise<CrmResult<{ id: string }>> {
  const body = await callPropelRoute<Envelope>(ROUTE, {
    action: 'ingestUrl',
    url,
    ...(tags ? { tags } : {}),
  });
  if (body && body.ok === true && typeof body.id === 'string') {
    return { ok: true, data: { id: body.id } };
  }
  if (body && body.ok === false && body.code === 'BAD_SOURCE') {
    return {
      ok: false,
      error: 'That URL can’t be ingested — use a public https page (no private hosts or files).',
    };
  }
  if (body && body.ok === false && body.code === 'FETCH_FAILED') {
    return {
      ok: false,
      error: 'Could not fetch that page — check the URL is reachable and try again.',
    };
  }
  return { ok: false, error: failMessage(body) };
}

export async function updateSource(
  id: string,
  patch: UpdateSourcePatch,
): Promise<CrmResult<{ id: string }>> {
  const body = await callPropelRoute<Envelope>(ROUTE, { action: 'update', id, patch });
  if (body && body.ok === true && typeof body.id === 'string') {
    return { ok: true, data: { id: body.id } };
  }
  return { ok: false, error: failMessage(body) };
}

export async function deleteSource(id: string): Promise<CrmResult<Record<string, never>>> {
  const body = await callPropelRoute<Envelope>(ROUTE, { action: 'delete', id });
  if (body && body.ok === true) {
    return { ok: true, data: {} };
  }
  return { ok: false, error: failMessage(body) };
}

// ── pure UI helpers ───────────────────────────────────────────────────────────

// Quick-add File derives the kind from the picked file's extension (client-read
// text files only in v1 — md / html / txt).
export const kindForFilename = (filename: string): SourceKind => {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'FILE_MD';
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'FILE_HTML';
  return 'FILE_TXT';
};

// Short badge label per kind (the Sources list + picker rows).
export const KIND_LABEL: Record<SourceKind, string> = {
  PASTE: 'Paste',
  FILE_MD: 'MD',
  FILE_HTML: 'HTML',
  FILE_TXT: 'TXT',
  FILE_PDF: 'PDF',
  FILE_DOCX: 'DOCX',
  URL: 'URL',
  GDOC: 'GDoc',
};

// Mantine badge color per kind (semantic-ish, consistent across surfaces).
export const KIND_COLOR: Record<SourceKind, string> = {
  PASTE: 'gray',
  FILE_MD: 'blue',
  FILE_HTML: 'orange',
  FILE_TXT: 'gray',
  FILE_PDF: 'red',
  FILE_DOCX: 'indigo',
  URL: 'cyan',
  GDOC: 'teal',
};

// Compact character-count hint, e.g. 950 → "950 chars", 12_400 → "12.4K chars".
export const formatCharCount = (n: number): string => {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}K chars`;
  return `${n} chars`;
};
