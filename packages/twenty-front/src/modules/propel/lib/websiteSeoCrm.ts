import { callPropelRoute } from '@/propel/lib/callPropelRoute';

// Real data layer for the Website tab's "SEO and AI" surface (the SEO-audit half).
//
// The crawler lives CRM-side as a Manager/Admin-gated logic-function route
// (propel-crm-integration, src/logic-functions/website-seo-audit-route.ts +
// website-seo-audit-core.ts on branch feat/website-crm-routes → develop):
//
//   POST /website/seo-audit   body { baseUrl }
//
// It fetches a small FIXED set of representative paths (home, areas index, one
// area-detail sample, one off-plan-project sample, guides index) against
// `baseUrl`, parses each response for missing meta description / og:image /
// JSON-LD structured data / images without alt text, and returns the issues in
// the SAME row shape SeoAiTab renders. It persists nothing — every call is a
// fresh crawl.
//
// We reach it through callPropelRoute (the sanctioned route bridge — same auth
// mechanism the rest of the hero uses: the agent's own session token; identity
// + role are derived server-side, and the route fails CLOSED to NOT_FOUND for a
// non-Manager). callPropelRoute returns the parsed 2xx body or null; the route
// answers 200 for BOTH the success payload (`{ ok:true, … }`) and the
// coordinator-gated / bad-input envelope (`{ error, code, … }`), so we narrow on
// the body shape here and hand the caller a discriminated result — a real error
// state with a message, never a fake-empty report.
//
// ⚠️ What is NOT wired (matches the route's own scope note — not faked):
//   • "Fix with AI" EXECUTION — the route reports `fixWithAiAvailable` per issue
//     but has no remediation endpoint. The UI surfaces the flag honestly; it does
//     not simulate a fix.
//   • AI-visibility monitor (ChatGPT/Perplexity/Gemini citation tracking) and the
//     automation toggles — no backend route/object exists yet (net-new, gated).
//     Those stay Preview panels in SeoAiTab, not wired here.

// Default target — the RE/MAX Hub marketing site the audit crawls.
export const DEFAULT_SEO_BASE_URL = 'https://remaxhub.ae';

export type SeoIssueSeverity = 'CRITICAL' | 'WARNING' | 'INFO';

// Exact row the route returns (website-seo-audit-core.ts SeoIssueRow).
export type SeoAuditIssue = {
  id: string;
  severity: SeoIssueSeverity;
  title: string;
  pageSlug: string;
  detail: string;
  fixWithAiAvailable: boolean;
};

// Raw success body from POST /website/seo-audit.
type SeoAuditSuccessBody = {
  ok: true;
  baseUrl: string;
  scannedAt: string; // ISO
  pagesAudited: number;
  pagesUnreachable: number;
  issues: SeoAuditIssue[];
};

// The gated / bad-input envelope the route returns instead (marketing-io.ts).
type SeoAuditEnvelopeBody = {
  error?: string;
  code?: string;
};

type SeoAuditRouteBody = SeoAuditSuccessBody | SeoAuditEnvelopeBody;

const isSuccessBody = (
  body: SeoAuditRouteBody | null,
): body is SeoAuditSuccessBody =>
  body !== null && (body as SeoAuditSuccessBody).ok === true;

// ── derived, honest summary (computed only from the crawl result) ─────────────
// No score is invented: every number below is derived from the pages the route
// actually crawled and the issues it actually found.
export type SeoAuditReport = {
  baseUrl: string;
  scannedAt: string;
  pagesAudited: number;
  pagesUnreachable: number;
  pagesReachable: number;
  issues: SeoAuditIssue[];
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  /** Distinct crawled pages that produced at least one issue. */
  pagesWithIssues: number;
  /** Share of crawled pages with ZERO issues (clean pages / pages crawled). */
  seoHealthPct: number;
  /** Share of crawled pages that DO carry JSON-LD structured data — the exact
   *  signal AI answer engines read. Derived from the missing-JSON-LD issues. */
  aiReadinessPct: number;
};

const pct = (part: number, whole: number): number =>
  whole > 0 ? Math.round((part / whole) * 100) : 0;

export const summarizeSeoAudit = (body: SeoAuditSuccessBody): SeoAuditReport => {
  const issues = Array.isArray(body.issues) ? body.issues : [];
  const pagesAudited = Math.max(0, body.pagesAudited ?? 0);
  const pagesUnreachable = Math.max(0, body.pagesUnreachable ?? 0);

  let criticalCount = 0;
  let warningCount = 0;
  let infoCount = 0;
  const pagesWithIssue = new Set<string>();
  const pagesMissingJsonLd = new Set<string>();

  for (const issue of issues) {
    if (issue.severity === 'CRITICAL') criticalCount++;
    else if (issue.severity === 'WARNING') warningCount++;
    else infoCount++;
    if (issue.pageSlug) pagesWithIssue.add(issue.pageSlug);
    // core ids are `${pathKind}:json-ld` for a missing structured-data block.
    if (issue.id.endsWith(':json-ld') && issue.pageSlug) {
      pagesMissingJsonLd.add(issue.pageSlug);
    }
  }

  return {
    baseUrl: body.baseUrl,
    scannedAt: body.scannedAt,
    pagesAudited,
    pagesUnreachable,
    pagesReachable: Math.max(0, pagesAudited - pagesUnreachable),
    issues,
    criticalCount,
    warningCount,
    infoCount,
    pagesWithIssues: pagesWithIssue.size,
    seoHealthPct: pct(pagesAudited - pagesWithIssue.size, pagesAudited),
    aiReadinessPct: pct(pagesAudited - pagesMissingJsonLd.size, pagesAudited),
  };
};

export type FetchSeoAuditResult =
  | { ok: true; report: SeoAuditReport }
  | { ok: false; error: string };

/**
 * Run a live SEO audit of `baseUrl` via the CRM route. Returns `{ ok:false }`
 * with a human-readable reason on any transport / auth / gating error so the
 * caller renders a real error state (with Retry) rather than a blank report.
 */
export const fetchSeoAudit = async (
  baseUrl: string = DEFAULT_SEO_BASE_URL,
): Promise<FetchSeoAuditResult> => {
  const trimmed = baseUrl.trim();
  if (trimmed === '') {
    return { ok: false, error: 'Enter a site URL to audit.' };
  }

  const body = await callPropelRoute<SeoAuditRouteBody>('/website/seo-audit', {
    baseUrl: trimmed,
  });

  // null = not signed in, non-2xx, or a network/parse failure inside the bridge.
  if (body === null) {
    return {
      ok: false,
      error: 'Could not reach the audit service (or you are not signed in).',
    };
  }

  if (!isSuccessBody(body)) {
    // Gated (non-Manager) or bad-input envelope — surface its message verbatim.
    const message =
      typeof body.error === 'string' && body.error.trim() !== ''
        ? body.error
        : body.code === 'NOT_FOUND'
          ? 'SEO audit is available to managers only.'
          : 'The SEO audit could not run.';
    return { ok: false, error: message };
  }

  return { ok: true, report: summarizeSeoAudit(body) };
};

/** "just now" / "3m ago" / "2h ago" / "4d ago" from an ISO timestamp. */
export const relativeScanAge = (iso: string, now: Date = new Date()): string => {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const mins = Math.max(0, Math.round((now.getTime() - t) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};
