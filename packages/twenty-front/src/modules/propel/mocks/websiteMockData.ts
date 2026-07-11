// Mock data for the Website tab of the Marketing Cloud hero (WEBSITE-REBUILD-DESIGN.md §6).
//
// SCOPE (this wave): the Website tab ships against REALISTIC MOCK DATA, not live routes.
// No CRM objects/fields exist yet for blogPost / landingPage / webLead (deliberately
// deferred — see propel-crm-integration CLAUDE.md task instructions for this wave). This
// module is the SINGLE source of truth for that mock data: every sub-tab component
// (OverviewTab, BlogTab, LandingPagesTab, SiteLeadsTab, SeoAiTab) and any shared
// sub-component MUST import its shape from here — do not invent parallel mock shapes
// in individual components.
//
// When the real backend lands (a later, carefully-staged task per CLAUDE.md), each
// `get*()` function below becomes the seam to swap for a `callPropelRoute(...)` call —
// keep the function names and return shapes stable so that swap is a one-line change
// per call site, not a UI rewrite. Nothing here is persisted; every "action" (approve
// idea, assign lead, run audit, fix issue) should mutate the in-memory array so the UI
// feels alive across a session, then reset on reload (no localStorage — mock only).

// ─────────────────────────────────────────────────────────────────────────────
// Overview
// ─────────────────────────────────────────────────────────────────────────────

export interface WebsiteOverviewMetric {
  key: 'visitors' | 'leads' | 'qualified' | 'pagesLive';
  label: string;
  value: number;
  deltaPct: number | null;
}

export type AgentJobKey =
  | 'ideas'
  | 'writer'
  | 'seoReviewer'
  | 'translator'
  | 'scheduler'
  | 'pageRefresher'
  | 'auditFix'
  | 'visibilityChecker';

export interface AgentActivityRow {
  id: string;
  agent: AgentJobKey;
  agentLabel: string;
  action: string;
  detail: string;
  whenLabel: string;
  status: 'RUNNING' | 'DONE' | 'NEEDS_REVIEW' | 'FAILED';
}

export interface SearchVisibilityPanel {
  indexedPages: number;
  totalPages: number;
  aiCitations: number;
  seoHealthPct: number;
  sitemapFreshnessLabel: string;
}

export interface WebsiteOverviewPayload {
  metrics: WebsiteOverviewMetric[];
  agentActivity: AgentActivityRow[];
  searchVisibility: SearchVisibilityPanel;
}

const AGENT_LABELS: Record<AgentJobKey, string> = {
  ideas: 'Ideas',
  writer: 'Writer',
  seoReviewer: 'SEO reviewer',
  translator: 'Translator',
  scheduler: 'Scheduler',
  pageRefresher: 'Page refresher',
  auditFix: 'Audit & fix',
  visibilityChecker: 'Visibility checker',
};

const mockAgentActivity: AgentActivityRow[] = [
  {
    id: 'act-1',
    agent: 'ideas',
    agentLabel: AGENT_LABELS.ideas,
    action: 'Proposed 4 new topics',
    detail: 'Justified by rising DLD search demand for "Dubai Hills villas"',
    whenLabel: '12m ago',
    status: 'NEEDS_REVIEW',
  },
  {
    id: 'act-2',
    agent: 'writer',
    agentLabel: AGENT_LABELS.writer,
    action: 'Drafted "Off-plan payment plans explained"',
    detail: '820 words, house style, EN',
    whenLabel: '38m ago',
    status: 'DONE',
  },
  {
    id: 'act-3',
    agent: 'seoReviewer',
    agentLabel: AGENT_LABELS.seoReviewer,
    action: 'Reviewed "Best areas for RCBI investors"',
    detail: '2 on-page issues flagged (meta description, H1 duplication)',
    whenLabel: '1h ago',
    status: 'NEEDS_REVIEW',
  },
  {
    id: 'act-4',
    agent: 'pageRefresher',
    agentLabel: AGENT_LABELS.pageRefresher,
    action: 'Refreshed Dubai Marina area page',
    detail: 'New DLD price trend + 14 transactions this month',
    whenLabel: '3h ago',
    status: 'DONE',
  },
  {
    id: 'act-5',
    agent: 'visibilityChecker',
    agentLabel: AGENT_LABELS.visibilityChecker,
    action: 'Ran weekly AI-visibility check',
    detail: '3 of 8 tracked prompts now cite remaxhub.ae',
    whenLabel: '6h ago',
    status: 'DONE',
  },
  {
    id: 'act-6',
    agent: 'scheduler',
    agentLabel: AGENT_LABELS.scheduler,
    action: 'Publish failed — Ghost API timeout',
    detail: '"Guide: buying off-plan in 2026" did not push to blog.remaxhub.ae',
    whenLabel: '9h ago',
    status: 'FAILED',
  },
  {
    id: 'act-7',
    agent: 'translator',
    agentLabel: AGENT_LABELS.translator,
    action: 'Translated 2 published posts to Arabic',
    detail: 'RTL layout verified',
    whenLabel: '1d ago',
    status: 'DONE',
  },
];

export const getWebsiteOverview = (): WebsiteOverviewPayload => ({
  metrics: [
    { key: 'visitors', label: 'Visitors (30d)', value: 18420, deltaPct: 12.4 },
    { key: 'leads', label: 'Leads (30d)', value: 214, deltaPct: 8.1 },
    { key: 'qualified', label: 'Qualified', value: 57, deltaPct: -3.2 },
    { key: 'pagesLive', label: 'Pages live', value: 142, deltaPct: 5.0 },
  ],
  agentActivity: mockAgentActivity,
  searchVisibility: {
    indexedPages: 128,
    totalPages: 142,
    aiCitations: 9,
    seoHealthPct: 78,
    sitemapFreshnessLabel: 'Updated 3h ago',
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Site leads
// ─────────────────────────────────────────────────────────────────────────────

export type SiteLeadStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'LOST';
export type SiteLeadSource =
  | 'CONTACT_FORM'
  | 'CONSULTATION'
  | 'REQUIREMENTS'
  | 'FIT_OUT'
  | 'RECRUITMENT'
  | 'GATED_PDF'
  | 'GUIDE_SUBMISSION'
  | 'VALUATION_WIDGET';

export interface SiteLeadRow {
  id: string;
  name: string;
  phone: string;
  source: SiteLeadSource;
  sourceLabel: string;
  campaign: string | null;
  slaAgeMinutes: number;
  slaBreached: boolean;
  status: SiteLeadStatus;
  assignee: string | null;
  estimatedValueAed: number | null; // set for VALUATION_WIDGET leads only
  pageSlug: string;
  createdLabel: string;
}

export interface SiteLeadsMetrics {
  totalLeads: number;
  medianFirstReplyMinutes: number;
  slaTargetMinutes: number;
  breachCount: number;
}

const SOURCE_LABELS: Record<SiteLeadSource, string> = {
  CONTACT_FORM: 'Contact form',
  CONSULTATION: 'Consultation request',
  REQUIREMENTS: 'Requirements form',
  FIT_OUT: 'Fit-out enquiry',
  RECRUITMENT: 'Recruitment',
  GATED_PDF: 'Gated PDF download',
  GUIDE_SUBMISSION: 'Guide submission',
  VALUATION_WIDGET: 'Valuation widget',
};

const mockSiteLeads: SiteLeadRow[] = [
  {
    id: 'lead-1',
    name: 'Fatima Al Marri',
    phone: '+971 50 111 2233',
    source: 'VALUATION_WIDGET',
    sourceLabel: SOURCE_LABELS.VALUATION_WIDGET,
    campaign: 'Dubai Hills valuation LP',
    slaAgeMinutes: 4,
    slaBreached: false,
    status: 'NEW',
    assignee: null,
    estimatedValueAed: 3_450_000,
    pageSlug: '/valuation',
    createdLabel: '4m ago',
  },
  {
    id: 'lead-2',
    name: 'James Whitfield',
    phone: '+44 7700 900123',
    source: 'GATED_PDF',
    sourceLabel: SOURCE_LABELS.GATED_PDF,
    campaign: 'RCBI investor playbook',
    slaAgeMinutes: 17,
    slaBreached: true,
    status: 'NEW',
    assignee: null,
    estimatedValueAed: null,
    pageSlug: '/guides/rcbi-playbook',
    createdLabel: '17m ago',
  },
  {
    id: 'lead-3',
    name: 'Priya Nair',
    phone: '+971 55 444 8899',
    source: 'CONTACT_FORM',
    sourceLabel: SOURCE_LABELS.CONTACT_FORM,
    campaign: null,
    slaAgeMinutes: 2,
    slaBreached: false,
    status: 'CONTACTED',
    assignee: 'Ahmed Saeed',
    estimatedValueAed: null,
    pageSlug: '/contact',
    createdLabel: '2m ago',
  },
  {
    id: 'lead-4',
    name: 'Omar Haddad',
    phone: '+971 52 333 7766',
    source: 'REQUIREMENTS',
    sourceLabel: SOURCE_LABELS.REQUIREMENTS,
    campaign: 'Off-plan Q3 push',
    slaAgeMinutes: 63,
    slaBreached: true,
    status: 'QUALIFIED',
    assignee: 'Layla Hassan',
    estimatedValueAed: null,
    pageSlug: '/off-plan',
    createdLabel: '1h ago',
  },
  {
    id: 'lead-5',
    name: 'Chen Wei',
    phone: '+971 56 222 5544',
    source: 'GUIDE_SUBMISSION',
    sourceLabel: SOURCE_LABELS.GUIDE_SUBMISSION,
    campaign: null,
    slaAgeMinutes: 130,
    slaBreached: true,
    status: 'LOST',
    assignee: 'Ahmed Saeed',
    estimatedValueAed: null,
    pageSlug: '/guides/buying-off-plan',
    createdLabel: '2h ago',
  },
  {
    id: 'lead-6',
    name: 'Sara Al Farsi',
    phone: '+971 50 999 1122',
    source: 'CONSULTATION',
    sourceLabel: SOURCE_LABELS.CONSULTATION,
    campaign: 'Palm Jumeirah launch',
    slaAgeMinutes: 8,
    slaBreached: false,
    status: 'NEW',
    assignee: null,
    estimatedValueAed: null,
    pageSlug: '/consultation',
    createdLabel: '8m ago',
  },
];

export const getSiteLeads = (): {
  rows: SiteLeadRow[];
  metrics: SiteLeadsMetrics;
} => ({
  rows: mockSiteLeads,
  metrics: {
    totalLeads: mockSiteLeads.length,
    medianFirstReplyMinutes: 14,
    slaTargetMinutes: 10,
    breachCount: mockSiteLeads.filter((r) => r.slaBreached).length,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Landing pages
// ─────────────────────────────────────────────────────────────────────────────

export type LandingPageTheme = 'NOCTURNE' | 'RIVIERA' | 'ATLAS';
export type LandingPageStatus = 'LIVE' | 'DRAFT';

export interface LandingPageCard {
  id: string;
  title: string;
  slug: string;
  theme: LandingPageTheme;
  status: LandingPageStatus;
  visits: number;
  leads: number;
  convPct: number;
  updatedLabel: string;
  thumbnailGradient: string; // CSS gradient standing in for a real screenshot
}

const mockLandingPages: LandingPageCard[] = [
  {
    id: 'lp-1',
    title: 'Dubai Hills valuation',
    slug: 'valuation-dubai-hills',
    theme: 'RIVIERA',
    status: 'LIVE',
    visits: 4210,
    leads: 96,
    convPct: 2.3,
    updatedLabel: '2d ago',
    thumbnailGradient: 'linear-gradient(135deg, #E8F0FE 0%, #C9DBFA 100%)',
  },
  {
    id: 'lp-2',
    title: 'RCBI investor playbook (gated PDF)',
    slug: 'rcbi-playbook',
    theme: 'NOCTURNE',
    status: 'LIVE',
    visits: 6840,
    leads: 188,
    convPct: 2.7,
    updatedLabel: '5d ago',
    thumbnailGradient: 'linear-gradient(135deg, #0B0E14 0%, #2A2416 100%)',
  },
  {
    id: 'lp-3',
    title: 'Palm Jumeirah launch',
    slug: 'palm-jumeirah-launch',
    theme: 'NOCTURNE',
    status: 'LIVE',
    visits: 3120,
    leads: 74,
    convPct: 2.4,
    updatedLabel: '1w ago',
    thumbnailGradient: 'linear-gradient(135deg, #10131C 0%, #1F1A0E 100%)',
  },
  {
    id: 'lp-4',
    title: 'Off-plan Q3 push',
    slug: 'offplan-q3',
    theme: 'ATLAS',
    status: 'DRAFT',
    visits: 0,
    leads: 0,
    convPct: 0,
    updatedLabel: '3h ago',
    thumbnailGradient: 'linear-gradient(135deg, #F7F5F0 0%, #E5E0D5 100%)',
  },
  {
    id: 'lp-5',
    title: 'Recruitment — join RE/MAX Hub',
    slug: 'careers',
    theme: 'RIVIERA',
    status: 'LIVE',
    visits: 1890,
    leads: 22,
    convPct: 1.2,
    updatedLabel: '2w ago',
    thumbnailGradient: 'linear-gradient(135deg, #E8F0FE 0%, #C9DBFA 100%)',
  },
  {
    id: 'lp-6',
    title: 'Fit-out consultation',
    slug: 'fit-out',
    theme: 'ATLAS',
    status: 'DRAFT',
    visits: 0,
    leads: 0,
    convPct: 0,
    updatedLabel: '1h ago',
    thumbnailGradient: 'linear-gradient(135deg, #F7F5F0 0%, #E5E0D5 100%)',
  },
];

export const getLandingPages = (): LandingPageCard[] => mockLandingPages;

// ─────────────────────────────────────────────────────────────────────────────
// Blog pipeline
// ─────────────────────────────────────────────────────────────────────────────

export type BlogStage = 'IDEAS' | 'DRAFTING' | 'SCHEDULED' | 'PUBLISHED';

export interface BlogIdeaItem {
  id: string;
  stage: 'IDEAS';
  title: string;
  justification: string;
  proposedByAgent: 'ideas';
}

export interface BlogDraftingItem {
  id: string;
  stage: 'DRAFTING';
  title: string;
  writerPct: number;
  seoReviewStatus: 'PENDING' | 'PASSED' | 'FLAGGED';
  seoIssueCount: number;
}

export interface BlogScheduledItem {
  id: string;
  stage: 'SCHEDULED';
  title: string;
  scheduledDateLabel: string;
  languages: ('EN' | 'AR')[];
  gatedPdf: boolean;
}

export interface BlogPublishedItem {
  id: string;
  stage: 'PUBLISHED';
  title: string;
  publishedDateLabel: string;
  views: number;
  leads: number;
  aiCited: boolean;
}

export type BlogPipelineItem =
  | BlogIdeaItem
  | BlogDraftingItem
  | BlogScheduledItem
  | BlogPublishedItem;

export interface BlogPipelineColumns {
  ideas: BlogIdeaItem[];
  drafting: BlogDraftingItem[];
  scheduled: BlogScheduledItem[];
  published: BlogPublishedItem[];
}

export const getBlogPipeline = (): BlogPipelineColumns => ({
  ideas: [
    {
      id: 'idea-1',
      stage: 'IDEAS',
      title: 'Off-plan payment plans explained',
      justification: 'Rising DLD search demand for "Dubai Hills villas"',
      proposedByAgent: 'ideas',
    },
    {
      id: 'idea-2',
      stage: 'IDEAS',
      title: 'Golden Visa via real estate: 2026 rules',
      justification: '3 tracked AI-visibility prompts mention rival content',
      proposedByAgent: 'ideas',
    },
    {
      id: 'idea-3',
      stage: 'IDEAS',
      title: 'Best areas for RCBI investors',
      justification: 'Launch calendar shows 4 new RCBI-eligible projects this month',
      proposedByAgent: 'ideas',
    },
    {
      id: 'idea-4',
      stage: 'IDEAS',
      title: 'Dubai Marina vs JBR: 2026 comparison',
      justification: 'High search volume, zero owned content ranking',
      proposedByAgent: 'ideas',
    },
  ],
  drafting: [
    {
      id: 'draft-1',
      stage: 'DRAFTING',
      title: 'Guide: buying off-plan in 2026',
      writerPct: 100,
      seoReviewStatus: 'FLAGGED',
      seoIssueCount: 2,
    },
    {
      id: 'draft-2',
      stage: 'DRAFTING',
      title: 'How RE/MAX Hub values a property',
      writerPct: 65,
      seoReviewStatus: 'PENDING',
      seoIssueCount: 0,
    },
  ],
  scheduled: [
    {
      id: 'sched-1',
      stage: 'SCHEDULED',
      title: 'Top 5 off-plan launches this quarter',
      scheduledDateLabel: '2026-07-05',
      languages: ['EN', 'AR'],
      gatedPdf: false,
    },
    {
      id: 'sched-2',
      stage: 'SCHEDULED',
      title: 'Investor playbook: RCBI eligibility checklist',
      scheduledDateLabel: '2026-07-08',
      languages: ['EN'],
      gatedPdf: true,
    },
  ],
  published: [
    {
      id: 'pub-1',
      stage: 'PUBLISHED',
      title: 'Dubai real estate market outlook 2026',
      publishedDateLabel: '2026-06-20',
      views: 4820,
      leads: 41,
      aiCited: true,
    },
    {
      id: 'pub-2',
      stage: 'PUBLISHED',
      title: 'Renting vs buying in Dubai: full breakdown',
      publishedDateLabel: '2026-06-12',
      views: 3110,
      leads: 22,
      aiCited: false,
    },
    {
      id: 'pub-3',
      stage: 'PUBLISHED',
      title: 'Dubai Marina area guide',
      publishedDateLabel: '2026-05-30',
      views: 6790,
      leads: 58,
      aiCited: true,
    },
  ],
});

// ─────────────────────────────────────────────────────────────────────────────
// SEO & AI visibility
// ─────────────────────────────────────────────────────────────────────────────

export type SeoIssueSeverity = 'CRITICAL' | 'WARNING' | 'INFO';

export interface SeoIssueRow {
  id: string;
  severity: SeoIssueSeverity;
  title: string;
  pageSlug: string;
  detail: string;
  fixWithAiAvailable: boolean;
}

// NOTE: the AI-visibility monitor is now REAL — it queries the search-grounded AI
// engines via the CRM route (aiVisibilityCrm.ts / useAiVisibility). The former
// fake `AiVisibilityPromptRow` / `AiVisibilityEngineResult` / `mockAiVisibilityPrompts`
// were removed (they rendered a fabricated "✓ Cited" that misled the founder).

export interface SeoAiScores {
  seoHealthPct: number;
  aiReadinessPct: number;
  indexedPct: number;
  citationCount: number;
}

export interface SeoAiAutomationToggles {
  monthlyDataRefresh: boolean;
  aiMetaOnPublish: boolean;
  arAutoTranslate: boolean;
  sitemapLlmsTxtCurrency: boolean;
  weeklyVisibilityRecheck: boolean;
}

const mockSeoIssues: SeoIssueRow[] = [
  {
    id: 'issue-1',
    severity: 'CRITICAL',
    title: 'Missing schema.org RealEstateListing markup',
    pageSlug: '/listings/dubai-marina-1204',
    detail: '14 listing pages have no structured data — invisible to rich results.',
    fixWithAiAvailable: true,
  },
  {
    id: 'issue-2',
    severity: 'CRITICAL',
    title: 'Placeholder phone number in LocalBusiness schema',
    pageSlug: '/',
    detail: 'Schema still shows +971-XXXXXXXXX — flagged in the repo audit.',
    fixWithAiAvailable: true,
  },
  {
    id: 'issue-3',
    severity: 'WARNING',
    title: 'Duplicate H1 tags',
    pageSlug: '/guides/rcbi-playbook',
    detail: 'Two H1 elements on the same page confuse crawlers.',
    fixWithAiAvailable: true,
  },
  {
    id: 'issue-4',
    severity: 'WARNING',
    title: 'Missing meta description',
    pageSlug: '/off-plan',
    detail: 'No meta description set — search engines will auto-generate one.',
    fixWithAiAvailable: true,
  },
  {
    id: 'issue-5',
    severity: 'INFO',
    title: 'Sitemap is 6 days stale',
    pageSlug: 'sitemap.xml',
    detail: '3 newly published pages are missing from the sitemap.',
    fixWithAiAvailable: false,
  },
];

export const getSeoAiData = (): {
  scores: SeoAiScores;
  issues: SeoIssueRow[];
  automation: SeoAiAutomationToggles;
} => ({
  scores: {
    seoHealthPct: 78,
    aiReadinessPct: 54,
    indexedPct: 90,
    citationCount: 9,
  },
  issues: mockSeoIssues,
  automation: {
    monthlyDataRefresh: true,
    aiMetaOnPublish: true,
    arAutoTranslate: false,
    sitemapLlmsTxtCurrency: true,
    weeklyVisibilityRecheck: true,
  },
});
