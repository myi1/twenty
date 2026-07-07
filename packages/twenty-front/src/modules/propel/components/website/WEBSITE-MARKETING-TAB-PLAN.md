# Website tab — build plan (foundation shipped, remaining surfaces sequenced)

Companion to `CONVENTIONS.md` (how the tab wires in) and
`propel-crm-integration/docs/WEBSITE-REBUILD-DESIGN.md` (the product spec, §6 sub-tabs
/ §8 phasing). This doc records **what is now real, what is still mock, and the exact
sequence + dependencies to finish each remaining surface.**

Branch: `feat/website-marketing-tab` (fork worktree
`~/dev/_wt/website-marketing-tab-fork`). The Website tab rides the **`marketing-hub`
hero** (`src/heroes/marketing-hub/index.tsx` → `pages/propel/MarketingHero.tsx`), so it
ships with the hero fast-path (no engine rebuild).

---

## Status matrix

| Sub-tab | State | Data source |
|---|---|---|
| **Overview** | **REAL top-line + breakdowns**; agent-feed & search-visibility panels are labelled *Preview* | `useSiteLeads` (People where `leadSource=WEBSITE`) + `websiteMockData` for the two preview panels |
| **Site leads** | **REAL, functional working queue** | `useSiteLeads` → `lib/websiteCrm.ts` GraphQL, agent's own token (propel-rls applies) |
| **Blog** | Mock | `websiteMockData.getBlogPipeline()` |
| **Landing pages** | Mock (card grid + GrapesJS `GrapesPageEditor` scaffold, not wired) | `websiteMockData.getLandingPages()` |
| **SEO and AI** | Mock | `websiteMockData.getSeoAiData()` |

---

## The web-lead data contract (already LIVE on CRM `develop`)

This is why Site Leads/Overview are real. `propel-crm-integration` (branch `develop`,
= staging) already carries the capture backend — **we did not build it, we read it:**

- `src/logic-functions/web-lead-route.ts` + `src/shared/web-lead-core.ts` — remaxhub.ae
  posts every form (`{formType, fields, utm, pageSlug}`) to one route → dedups a Person
  by phone/email and stamps:
  - `leadSource = 'WEBSITE'` — **the discriminator the queue filters on** (position 9 in
    `SOURCE_OPTIONS`). Agent-application submissions get **no** `leadSource`, so they are
    correctly excluded from the leads queue.
  - `contactType` / `contactTagNote` / `leadIntent` (GENUINE / BROWSER / NON_LEAD)
  - `sourceLink = pageSlug`; `sourceMeta` (RAW_JSON) = `{formType, pageSlug, utm{…},
    extras{…}, submissionId}`
  - `originalEnquiryAt`; the shared lead/SLA engine later fills `assignedAgent`,
    `assignedAt`, `relationshipState`, `routingState`, `slaBreachedAt`.
- Also live on `develop`: `website-concierge-route.ts` (AI concierge chat → same
  `ingestWebLead()`), `website-seo-audit-route.ts` + `website-seo-audit-core.ts` (SEO
  crawler), `meta-conversions-route.ts` (gated Meta CAPI). **These are the backends the
  SEO/AI and concierge surfaces will call — they exist, they are not yet wired to UI.**

> Deploy note: the queue reads whatever the **deployed** schema exposes. If staging/prod
> is behind `develop` and lacks `leadSource=WEBSITE`, the GraphQL call returns an error
> and the tab shows a real error state (not a fake-empty queue). Confirm the web-lead
> fields are deployed to the target env before relying on the numbers.

---

## What shipped this wave (files)

- `lib/websiteCrm.ts` — GraphQL read layer (`fetchSiteLeads`), `sourceMeta` JSON parse,
  `computeSiteLeadsMetrics`, `countBy`, age helpers. Read-only, agent-token, RLS-aware.
- `hooks/useSiteLeads.ts` — `{ phase, error, leads, metrics, reload }` (same shape as the
  other live hero hooks).
- `components/website/SiteLeadsTab.tsx` — real queue: metric strip, form/campaign/status
  filters, SLA-coloured age chips, `relationshipState` + `leadIntent` badges,
  `assignedAgent` display, **Open → `/object/person/:id`**, bulk select → **real
  client-side CSV export**.
- `components/website/OverviewTab.tsx` — real metric strip (total / this-week + Δ vs prior
  7d / unassigned / SLA breaches) + **Leads by source page** and **Leads by form type**
  breakdowns; agent-feed & search-visibility kept as *Preview* panels.

---

## Remaining surfaces — sequence, dependencies, effort

### R1 · Site Leads write actions (small, high value) — do next
The queue is read-only today (Open + CSV are real; assign / add-to-campaign are not).
- **Assign to agent** and **Add to campaign** need **manager-gated CRM routes** — do NOT
  add them from the front-end (constraint: routes are owned CRM-side). Add a thin
  `POST /marketing/website/site-leads/assign` (or reuse the existing lead-routing
  assigner) + `…/add-to-campaign` (reuse the campaign-recipient path the campaign builder
  already uses).
- Gate the bulk bar with `useViewerRole` (pattern in `CONVENTIONS.md` "Manager-gating").
- **Dep:** the two routes. **Effort:** ~0.5 day once routes exist.
- Optional: light polling / a "N new since you opened" banner (queue is fetch-on-mount +
  manual refresh today).

### R2 · SEO & AI (backend already exists — mostly a wiring job)
Spec §6 SEO/AI + §7. The crawler and Meta CAPI are **already built on `develop`.**
- Wire `SeoAiTab` to `website-seo-audit-route` (Run-full-audit → scores + issue list) and
  render **Fix-with-AI** per issue (calls an AI-fix route — reuse the marketing
  `draft-copy`-shaped pattern).
- AI-visibility monitor (tracked prompts × ChatGPT/Perplexity/Gemini, "Rival cited",
  add-prompt) → needs a small **visibility-check route + a store object** for tracked
  prompts (net-new, gated).
- Automation toggles (monthly refresh, AI meta on publish, AR auto-translate, sitemap/
  llms.txt currency, weekly re-check) → **Manager-gated** config surface + cron logic-fns.
- **Dep:** SEO audit route (exists) · AI-fix route + visibility store (net-new) · llms.txt
  emitted by the site (P2, site-side). **Effort:** ~2–3 days.

### R3 · Blog studio (Ghost headless)
Spec §3/§5/§6, decision §9 (Ghost self-hosted `blog.remaxhub.ae`, driven headlessly via
**Admin API** from the CRM).
- **Dep 0 (infra, blocking):** a Ghost instance (Hostinger Coolify, next to Postiz) +
  Admin API key in CRM env — open item §10. Nothing renders until this exists.
- CRM-side: `blogPost` object (pipeline state Ideas→Drafting→Scheduled→Published) + routes:
  idea-generate (grounded in dld-market/off-plan MCPs), draft-writer, SEO-review,
  scheduler→Ghost publish, legacy Mongo `GuideArticle` import. All **gated**, CRM-owned.
- Front-end: wire `BlogTab`'s 4-column board to a `useBlogPipeline` hook over those routes;
  approve/advance = route calls.
- **Effort:** ~4–5 days incl. the Ghost integration + import. **Biggest track.**

### R4 · Landing pages (GrapesJS section-assembly builder)
Spec §4 (section library) + §4A (cinematic hero, P5). Decision in `CONVENTIONS.md`
("GrapesJS reuse plan"): a **new `GrapesPageEditor`** sibling to the email editor —
section **assembly** (locked, theme-aware blocks), not freeform; **not** MJML.
- **Dep 0 (blocking):** the **~14-section library v1** must be built first (a "claude
  design" session per §4 — video/split hero, stats strip, listings grid, valuation widget,
  …), each a locked GrapesJS component with Nocturne/Riviera/Atlas theme-token hooks.
- CRM-side: a `landingPage` object (project JSON round-trip, same pattern as the email
  designer's saved-design JSON) + a **publisher** (`go.remaxhub.ae` Coolify app, §8A) +
  a `/marketing/draft-copy`-equivalent grounded in page-section context.
- Front-end: build `GrapesPageEditor` (the scaffold `GrapesPageEditor.tsx` /
  `GrapesPageBuilder.tsx` / `grapesPageTypes.ts` already exist as mock); wire
  `LandingPagesTab` cards to real page CRUD.
- **Effort:** ~1 wk (section library is the long pole). **P5 cinematic hero deferred.**

---

## Deploy (hero fast-path — no engine rebuild)

1. `cd ~/dev/_wt/website-marketing-tab-fork/packages/twenty-front`
2. `npm run build:hero marketing-hub` → `dist-heroes/marketing-hub/index.js`
3. Copy the bundle onto **both** the prod and staging hero mounts and `chmod 644`
   (see project memory *hero-deploy-fast-path* for the exact `cp`/`scp` targets), then
   hard-refresh. Staging first, validate the Site leads queue against real WEBSITE leads,
   then prod.
4. Reachable at `/marketing?tab=website&sub=site-leads` (routes are ungated; the sidebar
   flag is separate — memory *propel-hero-visibility-mechanism*).

**Verify before deploy:** `npx tsc --noEmit` from `packages/twenty-front` (esbuild
tree-shakes silently — a clean `build:hero` alone is NOT sufficient; both are done for
this wave) + a real browser load of the two real sub-tabs.
