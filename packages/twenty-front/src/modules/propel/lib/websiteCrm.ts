import { getTokenPair } from '@/apollo/utils/getTokenPair';
import { REACT_APP_SERVER_BASE_URL } from '~/config';

// Real data layer for the Website tab's "Site leads" + "Overview" surfaces.
//
// The new remaxhub.ae site posts every form to the CRM's `web-lead` route
// (propel-crm-integration, src/logic-functions/web-lead-route.ts on develop),
// which creates/dedups a Person and stamps:
//   • leadSource = 'WEBSITE'            ← the discriminator we filter on
//   • contactType / contactTagNote / leadIntent   (contact-tagging + intent)
//   • sourceLink  = pageSlug            (the page the form was submitted from)
//   • sourceMeta  = { formType, pageSlug, utm:{source,medium,campaign,…},
//                     extras:{…}, submissionId }   (RAW_JSON)
//   • originalEnquiryAt / assignedAgent / assignedAt / relationshipState /
//     routingState / slaBreachedAt      (the shared lead/SLA engine fills these)
//
// We read it straight off the core GraphQL endpoint with the AGENT'S OWN session
// token — the same thin-fetch bridge a2aCrm.ts / numbersCrm.ts / the dialer use
// (NOT the Apollo client). Reading with the agent's token means the queue honors
// propel-rls record visibility exactly like the rest of the CRM: an agent sees
// the website leads they can see, a manager sees the pool. This is READ-ONLY —
// every mutation (assign / add-to-campaign) belongs to a manager-gated route and
// is intentionally not done here.
//
// Agent applications are captured by the same route but with NO leadSource (they
// are not leads), so the `leadSource = WEBSITE` filter cleanly excludes them.

// ── form-type vocabulary (mirrors web-lead-core.ts FORM_TYPE_MAP labels) ──────
export type WebLeadFormType =
  | 'contact'
  | 'consultation'
  | 'requirements'
  | 'fitout'
  | 'playbook'
  | 'guide'
  | 'agent-application'
  | 'concierge';

export const FORM_TYPE_LABELS: Record<string, string> = {
  contact: 'Contact form',
  consultation: 'Consultation request',
  requirements: 'Property requirements',
  fitout: 'Fit-out enquiry',
  playbook: 'Playbook download',
  guide: 'Guide download',
  'agent-application': 'Agent application',
  concierge: 'AI concierge chat',
};

export const formTypeLabel = (formType: string | null): string =>
  formType ? (FORM_TYPE_LABELS[formType] ?? formType) : 'Website form';

// Relationship state is the Person lifecycle axis (person-relationship-state.field).
export type RelationshipState =
  | 'PROSPECT'
  | 'ACTIVE'
  | 'CLIENT'
  | 'ADVOCATE'
  | 'DORMANT'
  | 'LOST';

// leadIntent (person-lead-intent.field): GENUINE = agent-routable, BROWSER =
// nurture-only (gated-PDF downloads), NON_LEAD = off-pipeline.
export type LeadIntent = 'GENUINE' | 'BROWSER' | 'NON_LEAD' | 'UNCLASSIFIED';

export type SiteLead = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  createdAt: string; // ISO
  /** The page the form was submitted from (sourceLink / sourceMeta.pageSlug). */
  pageSlug: string | null;
  formType: string | null;
  formTypeLabel: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  relationshipState: RelationshipState | null;
  leadIntent: LeadIntent | null;
  /** Estimated AED value (valuation-widget leads only, from sourceMeta.extras). */
  estimatedValueAed: number | null;
  assigneeId: string | null;
  assigneeName: string | null;
  /** True once the lead-routing SLA engine stamped slaBreachedAt. */
  slaBreached: boolean;
};

type RawPersonNode = {
  id: string;
  createdAt?: string | null;
  name?: { firstName?: string | null; lastName?: string | null } | null;
  emails?: { primaryEmail?: string | null } | null;
  phones?: {
    primaryPhoneNumber?: string | null;
    primaryPhoneCallingCode?: string | null;
  } | null;
  contactType?: string | null;
  leadIntent?: string | null;
  relationshipState?: string | null;
  sourceLink?: string | null;
  sourceMeta?: unknown;
  slaBreachedAt?: string | null;
  originalEnquiryAt?: string | null;
  assignedAgent?: {
    id?: string | null;
    name?: { firstName?: string | null; lastName?: string | null } | null;
  } | null;
};

const PERSON_NODE = `
  id
  createdAt
  name { firstName lastName }
  emails { primaryEmail }
  phones { primaryPhoneNumber primaryPhoneCallingCode }
  contactType
  leadIntent
  relationshipState
  sourceLink
  sourceMeta
  slaBreachedAt
  originalEnquiryAt
  assignedAgent { id name { firstName lastName } }
`;

const SITE_LEADS_QUERY = `
  query PropelSiteLeads($filter: PersonFilterInput, $first: Int) {
    people(filter: $filter, first: $first) {
      edges { node { ${PERSON_NODE} } }
    }
  }
`;

const fullName = (
  n?: { firstName?: string | null; lastName?: string | null } | null,
): string => `${n?.firstName ?? ''} ${n?.lastName ?? ''}`.trim();

const toNumber = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
};

// sourceMeta is RAW_JSON — the core API may hand it back as a parsed object or,
// depending on the field driver, as a JSON string. Normalize both.
const parseSourceMeta = (
  raw: unknown,
): {
  formType: string | null;
  pageSlug: string | null;
  utm: Record<string, string> | null;
  extras: Record<string, unknown> | null;
} => {
  let obj: Record<string, unknown> | null = null;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      obj = null;
    }
  } else if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    obj = raw as Record<string, unknown>;
  }
  if (obj === null) {
    return { formType: null, pageSlug: null, utm: null, extras: null };
  }
  const utm =
    typeof obj.utm === 'object' && obj.utm !== null && !Array.isArray(obj.utm)
      ? (obj.utm as Record<string, string>)
      : null;
  const extras =
    typeof obj.extras === 'object' &&
    obj.extras !== null &&
    !Array.isArray(obj.extras)
      ? (obj.extras as Record<string, unknown>)
      : null;
  return {
    formType: typeof obj.formType === 'string' ? obj.formType : null,
    pageSlug: typeof obj.pageSlug === 'string' ? obj.pageSlug : null,
    utm,
    extras,
  };
};

const toSiteLead = (node: RawPersonNode): SiteLead => {
  const meta = parseSourceMeta(node.sourceMeta);
  const cc = node.phones?.primaryPhoneCallingCode ?? '';
  const num = node.phones?.primaryPhoneNumber ?? '';
  const phone = `${cc}${num}`.trim() || null;
  const formType = meta.formType;
  // Valuation-widget leads carry an estimated AED figure in extras — surface it
  // when present (spec §6: "Valuation leads show estimated AED"). Tolerant of a
  // few plausible key names since the site owns the extras vocabulary.
  const estimatedValueAed =
    toNumber(meta.extras?.estimatedValue) ??
    toNumber(meta.extras?.estimatedValueAed) ??
    toNumber(meta.extras?.valuation) ??
    null;

  return {
    id: node.id,
    name: fullName(node.name) || 'Website Lead',
    phone,
    email: node.emails?.primaryEmail ?? null,
    createdAt:
      node.createdAt ?? node.originalEnquiryAt ?? new Date().toISOString(),
    pageSlug: node.sourceLink ?? meta.pageSlug ?? null,
    formType,
    formTypeLabel: formTypeLabel(formType),
    utmSource: meta.utm?.source ?? null,
    utmMedium: meta.utm?.medium ?? null,
    utmCampaign: meta.utm?.campaign ?? null,
    relationshipState: (node.relationshipState as RelationshipState) ?? null,
    leadIntent: (node.leadIntent as LeadIntent) ?? null,
    estimatedValueAed,
    assigneeId: node.assignedAgent?.id ?? null,
    assigneeName: node.assignedAgent ? fullName(node.assignedAgent.name) : null,
    slaBreached: Boolean(node.slaBreachedAt),
  };
};

export type FetchSiteLeadsResult =
  | { ok: true; leads: SiteLead[] }
  | { ok: false; error: string };

/**
 * Fetch every website-originated lead (Person where leadSource = WEBSITE), newest
 * first, capped at `limit`. Returns `{ ok:false }` with a human-readable reason on
 * any transport/schema error so the caller renders a real error state rather than
 * silently showing an empty queue that isn't actually empty.
 */
export const fetchSiteLeads = async (
  limit = 200,
): Promise<FetchSiteLeadsResult> => {
  const token = getTokenPair()?.accessOrWorkspaceAgnosticToken?.token;
  if (token === undefined || token === '') {
    return { ok: false, error: 'Not signed in.' };
  }
  try {
    const response = await fetch(`${REACT_APP_SERVER_BASE_URL}/graphql`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        query: SITE_LEADS_QUERY,
        variables: {
          filter: { leadSource: { in: ['WEBSITE'] } },
          first: limit,
        },
      }),
    });
    if (!response.ok) {
      return { ok: false, error: `Server responded ${response.status}.` };
    }
    const json = (await response.json()) as {
      data?: { people?: { edges?: { node: RawPersonNode }[] } };
      errors?: { message?: string }[];
    };
    if (json.errors && json.errors.length > 0) {
      return {
        ok: false,
        error: json.errors[0]?.message ?? 'Query failed.',
      };
    }
    const leads = (json.data?.people?.edges ?? [])
      .map((e) => toSiteLead(e.node))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { ok: true, leads };
  } catch {
    return { ok: false, error: 'Could not reach the CRM.' };
  }
};

// ── derived metrics (shared by Site leads + Overview) ─────────────────────────

const MS_PER_MIN = 60_000;

export type SiteLeadsMetrics = {
  total: number;
  thisWeek: number;
  last7dVsPrior7dPct: number | null;
  unassigned: number;
  slaBreaches: number;
  medianAgeMinutesUnworked: number | null;
};

const startOfWeek = (now: Date): Date => {
  const d = new Date(now);
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d;
};

export const computeSiteLeadsMetrics = (
  leads: SiteLead[],
  now: Date = new Date(),
): SiteLeadsMetrics => {
  const weekStart = startOfWeek(now).getTime();
  const nowMs = now.getTime();
  const sevenD = 7 * 24 * 60 * MS_PER_MIN;

  let thisWeek = 0;
  let last7d = 0;
  let prior7d = 0;
  let unassigned = 0;
  let slaBreaches = 0;
  const unworkedAges: number[] = [];

  for (const l of leads) {
    const created = new Date(l.createdAt).getTime();
    if (Number.isFinite(created)) {
      if (created >= weekStart) thisWeek++;
      const age = nowMs - created;
      if (age <= sevenD) last7d++;
      else if (age <= 2 * sevenD) prior7d++;
      if (l.assigneeId === null) unworkedAges.push(age / MS_PER_MIN);
    }
    if (l.assigneeId === null) unassigned++;
    if (l.slaBreached) slaBreaches++;
  }

  unworkedAges.sort((a, b) => a - b);
  const medianAgeMinutesUnworked =
    unworkedAges.length > 0
      ? Math.round(unworkedAges[Math.floor(unworkedAges.length / 2)])
      : null;

  const last7dVsPrior7dPct =
    prior7d > 0
      ? Math.round(((last7d - prior7d) / prior7d) * 100)
      : last7d > 0
        ? 100
        : null;

  return {
    total: leads.length,
    thisWeek,
    last7dVsPrior7dPct,
    unassigned,
    slaBreaches,
    medianAgeMinutesUnworked,
  };
};

export type CountBucket = { key: string; label: string; count: number };

export const countBy = (
  leads: SiteLead[],
  pick: (l: SiteLead) => { key: string; label: string } | null,
): CountBucket[] => {
  const map = new Map<string, CountBucket>();
  for (const l of leads) {
    const k = pick(l);
    if (k === null) continue;
    const existing = map.get(k.key);
    if (existing) existing.count++;
    else map.set(k.key, { key: k.key, label: k.label, count: 1 });
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
};

/** Compact "3m ago" / "2h ago" / "4d ago" from an ISO timestamp. */
export const relativeAge = (iso: string, now: Date = new Date()): string => {
  const mins = Math.max(
    0,
    Math.round((now.getTime() - new Date(iso).getTime()) / MS_PER_MIN),
  );
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

export const ageMinutes = (iso: string, now: Date = new Date()): number =>
  Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / MS_PER_MIN));
