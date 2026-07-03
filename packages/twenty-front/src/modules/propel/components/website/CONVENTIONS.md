# Website tab — build conventions

Read this before building any Website sub-tab. It documents where files go, how the
tab wires into the existing Marketing hero, the Manager-gating pattern (Website is
**NOT** gated — see below), the GrapesJS reuse plan for Landing pages, and the mock
data contract every sub-tab must import from.

Spec: `propel-crm-integration` repo, `docs/WEBSITE-REBUILD-DESIGN.md` §6 (sub-tab specs
"as mocked"). Read that section before writing a component.

## Repo topology (read this first — a common confusion point)

This work spans **two separate git repositories**:

- `propel-crm-integration` (this task's orchestrating repo) — the Twenty-SDK **app
  manifest** only (`src/**`: objects, fields, logic-functions, roles). It does **not**
  contain `packages/twenty-front`. Its worktree for this task:
  `/Users/yahyaismail/dev/_wt/website-marketing-tab` (branch `feat/website-marketing-tab`,
  based on `origin/develop`). You will NOT put any React/twenty-front files there.
- **The Twenty fork** (`myi1/twenty` via remote `myfork`, checked out at
  `/Users/yahyaismail/dev/twenty`) — this is where `packages/twenty-front` and the
  `marketingHero/` React components actually live. All UI work for this task happens
  in a **worktree of the fork repo**:
  `/Users/yahyaismail/dev/_wt/website-marketing-tab-fork`
  (branch `feat/website-marketing-tab`, based on `myfork/feat/campaign-builder-rework`
  — the most current branch carrying the full Marketing hero tab set: Home, Campaigns,
  Templates, Social, Numbers, Lead Routing).

**Build agents: your working directory is
`/Users/yahyaismail/dev/_wt/website-marketing-tab-fork`, not the `-crm-integration`
worktree of the same base name.** `node_modules` there is symlinked to
`/Users/yahyaismail/dev/twenty/node_modules` (already verified working).

## File locations

All new files live under:

```
packages/twenty-front/src/modules/propel/components/website/
├── CONVENTIONS.md                 (this file)
├── WebsiteTab.tsx                 (sub-tab router, mirrors MarketingHero.tsx pattern)
├── OverviewTab.tsx
├── BlogTab.tsx
├── LandingPagesTab.tsx
├── SiteLeadsTab.tsx
├── SeoAiTab.tsx
└── (shared sub-components as needed, e.g. AgentActivityFeed.tsx, SlaAgeChip.tsx)
```

Mock data (single source, see below):

```
packages/twenty-front/src/modules/propel/mocks/websiteMockData.ts
```

Registration point (existing file, edit don't duplicate):

```
packages/twenty-front/src/pages/propel/MarketingHero.tsx
```

## Tab registration steps

`MarketingHero.tsx` is the existing top-level hero page (mounted at `AppPath.MarketingHub`,
`/marketing`) with a Mantine `<Tabs>` strip: Home · Campaigns · Templates · Social ·
Numbers · Lead Routing. Website becomes the **7th top-level tab**, positioned after
Numbers and before Lead Routing (Lead Routing stays last — it's the Manager-only tab;
Website is visible to everyone, same as Home/Campaigns/etc).

To add it:

1. Add `'website'` to the `HeroTab` union and `TAB_VALUES` array in `MarketingHero.tsx`.
2. Import `WebsiteTab` from `@/propel/components/website/WebsiteTab`.
3. Add a `<Tabs.Tab value="website" leftSection={<IconWorld size={15} />}>Website</Tabs.Tab>`
   to `Tabs.List` (pick an icon from `twenty-ui/display` — `IconWorld` fits; confirm it's
   exported before using it, fall back to `IconBrowser` or similar if not).
4. Add a `<Tabs.Panel value="website">{activeTab === 'website' ? <WebsiteTab /> : null}</Tabs.Panel>`
   entry to `tabPanels`, following the exact `keepMounted={false}` / conditional-render
   pattern the other panels use (only fetch/mount when active).
5. Website does **NOT** need a role gate — unlike Lead Routing (`canSeeLeadRouting`),
   every tab spec in §6 is read/manage surface appropriate for agents too (site leads
   in particular is a working queue, same audience as the Inbox). Do not wire
   `useViewerRole` into the Website tab or its sub-tabs unless the founder later asks
   for a Manager-only sub-tab (e.g. SEO/AI automation toggles could plausibly become
   Manager-gated in a later pass — flagged, not built, this wave).

## `WebsiteTab.tsx` — the sub-tab router

Mirror `MarketingHero.tsx`'s own structure one level down: a **second, nested** Mantine
`<Tabs>` for the 5 sub-tabs (`Overview · Blog · Landing pages · Site leads · SEO and AI`),
URL-synced the same way (`?tab=website&sub=overview` — extend the existing `useSearchParams`
pattern with a second query param `sub`, defaulting to `overview`). Each sub-tab panel
follows the same `activeSubTab === 'x' ? <XTab /> : null` conditional-mount idiom so an
inactive sub-tab pays no render/fetch cost.

Sub-tab value ↔ component map:

| `sub=` value | Component | Spec §6 bullet |
|---|---|---|
| `overview` | `OverviewTab` | metric strip + "Agents at work" feed + search-visibility panel |
| `blog` | `BlogTab` | agent status chips + 4-column pipeline board (Ideas/Drafting/Scheduled/Published) |
| `landing-pages` | `LandingPagesTab` | template/page cards + "New page from a prompt" + creation flow entry |
| `site-leads` | `SiteLeadsTab` | working queue: metric strip, filters, bulk bar, SLA-colored rows |
| `seo-ai` | `SeoAiTab` | scores, issues list w/ Fix-with-AI, AI visibility monitor, automation toggles |

## Manager-gating pattern (reference, for when it IS needed)

Not used by Website this wave (see above), but this is the exact pattern to reach for if
a later sub-surface needs it — e.g. copy verbatim from `LeadRoutingTab`'s gate in
`MarketingHero.tsx`:

```tsx
import { isManagerRole, useViewerRole } from '@/propel/hooks/useViewerRole';

const { role: viewerRole } = useViewerRole();
const canSeeX = isManagerRole(viewerRole);
```

`useViewerRole()` (`packages/twenty-front/src/modules/propel/hooks/useViewerRole.ts`)
probes `/marketing/inbox` (existing, unchanged route) for `viewerRole`
(`'ADMIN' | 'MANAGER' | 'AGENT' | null`) — server-authoritative, can't be spoofed. While
loading, `role` is `null` and gated UI stays **hidden** (fail-closed). Every write route
this UI would call is independently fail-closed server-side regardless of this client
gate — it exists purely to avoid showing agents a control surface they can't use.

## Mantine layout conventions (follow `LeadRoutingTab.tsx` / `CampaignsTab.tsx`)

- Root of each sub-tab: `<Box p="md">` — the enclosing `Tabs.Panel` (both hero-level and
  the new Website-level nested Tabs) already owns the single scroll region
  (`flex:1; minHeight:0; overflowY:auto` — see the "SHARED SCROLL FIX" comment block in
  `MarketingHero.tsx`). Do **not** add your own `calc(100vh - Npx)` height hacks or a
  second scroll container — that was a past bug class, now fixed once at the hero shell.
- Section header idiom: `<Group justify="space-between" align="flex-start" mb="md">`
  with an icon + `<Title order={4}>` on the left, actions (Refresh, New, Run audit, etc)
  on the right.
- Empty states: `<Paper withBorder p="xl" radius="md" style={{ borderStyle: 'dashed' }}>`
  wrapping a centered `<Stack align="center" gap="md">` — see `LeadRoutingTab`'s "No
  source rows yet" block.
- Loading: `<Center h={240}><Loader color="red" /></Center>`.
- Errors: `<Alert color="red" icon={<IconAlertTriangle size={16} />} variant="light">`.
- Brand color is `color="red"` throughout (Mantine's `red` maps to the RE/MAX accent via
  the workspace's Mantine theme — see `PropelMantineProvider`). Don't hardcode hex except
  where email/PDF payload literals are unavoidable (not applicable here).
- Tables: `<Table striped highlightOnHover verticalSpacing="sm" horizontalSpacing="md"
  layout="auto" stickyHeader>` for the Site leads queue (mirrors `LeadRoutingTab`'s table).
- Cards (Landing pages, Blog columns): use `<Paper withBorder radius="md" p="md">` per
  card; a CSS-grid or Mantine `<SimpleGrid>` wrapper for the card layout, not a raw flex
  wrap (match `TemplatesTab.tsx`'s template-grid approach — read it before building
  `LandingPagesTab` for the exact grid idiom used there).
- Status/SLA color chips: use Mantine `<Badge>` with semantic color (`red` = breached/
  critical, `yellow`/`orange` = warning/at-risk, `teal`/`green` = healthy/done, `gray` =
  neutral/draft) — consistent with `AttentionRow`'s `kind` styling in the Home tab widgets.

## Data-fetching pattern (mock-backed this wave)

Real hero tabs fetch via `callPropelRoute('/marketing/...', {...})` (see
`packages/twenty-front/src/modules/propel/lib/callPropelRoute.ts`) inside a small
`useXData()` hook (see `useLeadRoutingConfig.ts`, `useMarketingHub.ts` for the shape:
`{ phase, error, data, reload, ...mutators }`). **This wave does not call any route** —
per the task's scope constraint, no new CRM objects/fields/routes exist yet.

Instead, each sub-tab (or a thin per-tab hook, e.g. `useWebsiteOverviewMock()`) imports
its data directly from `websiteMockData.ts`'s `get*()` functions. Keep the **shape** of
each hook's return value identical to what a live hook would eventually return
(`{ phase: 'idle', error: null, data, reload: () => {} }`) so swapping in a real
`callPropelRoute` call later is a body-only change, not a call-site rewrite across 5
components. `reload()` can just re-derive from the mock module (or no-op) for now — do
**not** wire a `useEffect` + `useState` + fetch cycle against nothing; that's over-
engineering for mock data. A plain `const data = getWebsiteOverview();` at the top of
`OverviewTab` is fine and is the simplest correct choice — reserve the hook wrapper for
sub-tabs that need real local UI state (e.g. `SiteLeadsTab` needs filter/selection state
regardless of data source).

## GrapesJS reuse plan — Landing pages sub-tab

**Decision: extend `GrapesEmailEditor`'s established PATTERN with a new sibling
`GrapesPageEditor`, not a parallel from-scratch editor and not a forced reuse of the
email editor itself.**

Rationale:
- The **pattern** (lazy wrapper + heavy editor, `grapesjs` + `@grapesjs/react`, a
  `compileHtml`-style export helper, a save-as-X modal, brand-kit constants, an
  AI-copilot side panel wired to a `/marketing/draft-copy`-shaped route) is exactly
  right for Landing pages too — reuse the SHAPE, not the MJML specifics.
- The **plugin is wrong for pages**: `grapesjs-mjml` renders `<mjml><mj-body>…`
  email-safe markup. Landing pages are full HTML/CSS pages (hero sections, grids,
  themed by Nocturne/Riviera/Atlas design tokens per spec §4) — MJML's mobile-table
  email layout model doesn't fit a marketing page and would fight the section-assembly
  model spec §4 demands ("assembly, not freeform" — locked components, not raw blocks).
- Spec §4 explicitly constrains the page editor to **section assembly**: a left rail of
  pre-built, theme-aware section blocks (video hero, split hero, stats strip, listings
  grid, valuation widget, etc — the ~14-section launch set), not GrapesJS's default
  freeform block/style-manager UI the email editor exposes. That is a materially
  different `BlockManager` registration + a *locked* Style Manager (or none) — different
  enough to warrant its own component rather than a mode-flag bolted onto
  `GrapesEmailEditor` (which would bloat one 1400-line file with two unrelated concerns
  and risk regressing the email editor).
- Reuse literally, not conceptually, wherever the concern is shared:
  - The **lazy-load wrapper shape** (`GrapesEmailBuilder.tsx`'s `lazy()` + `Suspense`
    pattern) — copy it verbatim as `GrapesPageBuilder.tsx` wrapping a new
    `GrapesPageEditor.tsx`. Same reasoning applies: defer grapesjs module evaluation
    until the editor actually mounts (Landing pages tab shows just the card grid until
    "New page from a prompt" or "Edit" opens the editor).
  - The **types module split** (`grapesEmailTypes.ts` — tiny, no grapesjs import, so
    the lazy wrapper doesn't pull in the heavy lib) — mirror as `grapesPageTypes.ts`.
  - The **brand-kit contrast-aware logo helpers** (`logoForBackground`,
    `parseColorToRgb`) are worth factoring into a shared
    `packages/twenty-front/src/modules/propel/lib/brandKit.ts` if/when this editor is
    actually built (out of scope for THIS mock-data wave, which only needs static card
    data — flag it in the eventual page-editor task rather than duplicating ~40 lines).
  - The **AI co-pilot panel shape** (mode toggle between "write copy" and "generate
    design/layout", quick-action chips, chat log) — reuse the `AiCopilotPanel`
    component's structure; for pages it would ground against
    `/marketing/draft-copy`-equivalent with page-section context instead of
    email-campaign context.
- This decision only needs to be **recorded now**; per this wave's scope constraint (mock
  UI only, no new routes/objects), `GrapesPageEditor` is **not built this wave** —
  `LandingPagesTab.tsx` renders the card grid + a stub "New page from a prompt" button
  (can open a disabled/"coming soon" modal, or navigate nowhere yet) against
  `getLandingPages()` mock data only. Building the actual assembly editor is P3 work per
  WEBSITE-REBUILD-DESIGN.md §8 phasing and depends on the ~14-section library (§4) that
  doesn't exist yet.

## Mock data module contract

**Single source of truth:** `packages/twenty-front/src/modules/propel/mocks/websiteMockData.ts`.
Every sub-tab component imports its shapes and `get*()` functions from there — **do not**
define ad-hoc mock arrays inline in a component or invent a differently-shaped row type
for the same concept (e.g. two different "SLA age chip" row shapes across `SiteLeadsTab`
and some shared widget). If a sub-tab needs a derived view of the mock data (e.g. a
filtered/sorted subset), derive it in the component with `useMemo`, don't fork the source
data.

Exported types + functions (already written, read the file in full before building against
it — this list is a map, not a substitute):

| Concern | Types | Function |
|---|---|---|
| Overview | `WebsiteOverviewMetric`, `AgentActivityRow`, `AgentJobKey`, `SearchVisibilityPanel`, `WebsiteOverviewPayload` | `getWebsiteOverview()` |
| Site leads | `SiteLeadRow`, `SiteLeadStatus`, `SiteLeadSource`, `SiteLeadsMetrics` | `getSiteLeads()` → `{ rows, metrics }` |
| Landing pages | `LandingPageCard`, `LandingPageTheme`, `LandingPageStatus` | `getLandingPages()` |
| Blog pipeline | `BlogPipelineItem` (union of `BlogIdeaItem` \| `BlogDraftingItem` \| `BlogScheduledItem` \| `BlogPublishedItem`), `BlogPipelineColumns` | `getBlogPipeline()` → `{ ideas, drafting, scheduled, published }` |
| SEO & AI | `SeoIssueRow`, `SeoIssueSeverity`, `AiVisibilityPromptRow`, `AiVisibilityEngineResult`, `SeoAiScores`, `SeoAiAutomationToggles` | `getSeoAiData()` → `{ scores, issues, visibilityPrompts, automation }` |

Notes on using it:
- `LandingPageTheme` values (`NOCTURNE | RIVIERA | ATLAS`) match the RE/MAX doc design
  system (see project memory `remax-doc-design-system.md`) — when rendering a theme
  badge/swatch, Nocturne = dark/gold, Riviera = light coastal, Atlas = editorial. Card
  `thumbnailGradient` is a CSS gradient stand-in for a real page screenshot; render it as
  a `background: <value>` on the card's preview area, don't try to treat it as an image URL.
- `SiteLeadRow.estimatedValueAed` is `null` for every source except `VALUATION_WIDGET` —
  per spec §6 ("Valuation leads show estimated AED"), only render the AED figure when
  non-null; don't zero-fill other rows.
- `AgentActivityRow.status` drives the activity feed's icon/color (`RUNNING` = spinner,
  `DONE` = check, `NEEDS_REVIEW` = the founder's action queue, `FAILED` = red alert) —
  this is the "Agents at work" feed from §6's Overview bullet.
- Mock "actions" (approve an idea, assign a lead, run an audit, click Fix-with-AI) should
  be implemented as local component state mutations (e.g. `useState` seeded from
  `getX()`, then `setState` on click) so the UI feels interactive in a demo/QA pass —
  they do not need to persist or call any route this wave.

## Verification

Every touched/new `.tsx`/`.ts` file MUST pass a real `npx tsc --noEmit` from
`packages/twenty-front` before being called done — `build:hero`'s esbuild step
tree-shakes silently and will NOT catch an unbound identifier (see propel-crm-integration
CLAUDE.md / KNOWN_GOTCHAS.md "Hero builds never typecheck"). A clean esbuild is not
sufficient evidence of correctness.
