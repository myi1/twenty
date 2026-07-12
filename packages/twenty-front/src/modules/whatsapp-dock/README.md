# Floating WhatsApp Dock (founder feature #2)

Message any CRM contact on WhatsApp from **anywhere** in the app — the WhatsApp
sibling of the floating `DialerDock`.

## Why this is shell-level (rides an engine rebuild)

The dock must be visible on every page, so — exactly like `DialerDock` — it is
mounted once in `modules/app/components/App.tsx`, **outside** the router. That
makes it part of the `twenty-front` bundle baked into the fork engine image. It
is **not** a runtime-loaded hero (heroes ride a record/route anchor and only
render on their own page, so they can never be global). Therefore this change
**ships only with an engine image rebuild** (`engine-build.yml` on `myfork`) —
there is no `build:hero` fast-path for it. That is the deciding architectural
finding; the code here is staged, review-ready, and turnkey for the next build.

## What it does

1. Flag-gated (`REACT_APP_WA_DOCK_ENABLED=true`) so it dark-ships; absent flag →
   renders nothing (same gate style as `REACT_APP_DIALER_DOCK_URL`).
2. Floating pill bottom-right, stacked **above** the dialer pill
   (default `bottom: 130` vs the dialer's `72`), draggable, position persisted.
3. Click → compact panel: search People by name → pick a contact → compose box →
   send.
4. 24h-window aware, reusing the **existing** inbox rule (no new server code):
   - Existing thread → `POST /s/marketing/inbox-reply`. On an OFFICIAL
     (Meta Cloud-API) line >24h since last inbound, that route returns
     `{ windowClosed: true, suggestedTemplate }`; the dock then offers the
     approved template and sends it via the same route with `templateName`.
   - No thread yet → `POST /s/whatsapp/send` compose mode
     (`{ waPhoneNumber, body }`); wa-service find-or-creates the conversation
     (EVERYDAY line).
5. Honest states: no phone on file → disabled with a reason; rejected/not-on-
   WhatsApp → surfaced from the send result; unreachable → retry hint.
6. Attribution is server-derived from the session token (never a client id), and
   all lookups run under the agent's own RLS visibility.

## Files

- `components/WhatsAppDock.tsx` — the dock UI (drag/persist/expand mirror
  `DialerDock`; theme-neutral dark, WhatsApp-green accent, since it renders
  outside `BaseThemeProvider` — same constraint the dialer documents).
- `utils/whatsAppComposeBridge.ts` — person search, WhatsApp-target resolution,
  and the two send paths above.
- `modules/app/components/App.tsx` — `<WhatsAppDock />` mounted next to
  `<DialerDock />`.

## Server dependencies (already exist — nothing to add)

- `/s/whatsapp/send` (`whatsapp-send-route.ts`) — compose mode.
- `/s/marketing/inbox-reply` (`marketing-inbox-reply-route.ts`) — thread reply +
  OFFICIAL 24h window/template.
- `WA_SERVICE_URL` + `WA_SERVICE_TOKEN` on the server (already the dialer/inbox
  dependency; the dock inherits their state and reports honestly when unset).

## Verification status

- `tsc --noEmit` on `twenty-front` passes clean **with these files included**.
- Browser verification is **not possible without the engine rebuild** (the shell
  bundle must be rebuilt to observe it) — that is the same reason it is scoped
  rather than fast-path deployed. Post-rebuild QA: flip
  `REACT_APP_WA_DOCK_ENABLED=true` on staging, hard-refresh, confirm the pill
  appears above the dialer, search → pick → send on an EVERYDAY contact, then an
  OFFICIAL >24h contact to see the template fallback.

## Theming caveat

Because the dock lives outside `BaseThemeProvider`, it cannot read Nocturne
`_pulse` emotion tokens (the dialer has the same limitation and hardcodes its
palette). Styling here is self-contained dark to match the dialer and read as
Nocturne; if a future refactor moves both docks inside the theme provider, they
can switch to `_pulse` tokens together.
