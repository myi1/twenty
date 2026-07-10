/* eslint-disable @nx/enforce-module-boundaries */
// ─────────────────────────────────────────────────────────────────────────────
// Marketing — runtime-loaded HERO ENTRY
// ─────────────────────────────────────────────────────────────────────────────
//
// Build entry for the runtime-loaded Marketing hero bundle (vite.hero.config.ts →
// dist-heroes/marketing-hub/index.js). Re-exports the EXISTING, unchanged
// MarketingHero page as the bundle's default export. See listing-studio/index.tsx
// for the bundled-vs-externalized contract; the `host` prop bag is accepted for
// forward-compat but the page self-serves auth/data via the shimmed
// callPropelRoute / getTokenPair.

import { MarketingHero as MarketingHubPage } from '~/pages/propel/MarketingHero';
import { type PropelHeroHost } from '@/propel/runtime/heroHost';

// Twenty binds its global "g"-sequence nav shortcuts (g→p People, g→c Companies…)
// with enableOnFormTags:true, so a plain keystroke typed into ANY hero text field
// leaks up to the document-level hotkey listener — e.g. typing "...blog post..."
// fires g→p and yanks the user to the People page mid-sentence. Guard: on the
// BUBBLE phase (after the field has received the key), stop a plain-character
// keydown that originated in a text-entry element from reaching that listener.
// Modifier combos (⌘K, ⌘S, etc.) are let through so global shortcuts still work,
// and non-text targets are untouched. Real DOM + one shared React here (the
// twenty-front hero, not the sandbox), so stopPropagation is reliable.
const isTextEntry = (el: EventTarget | null): boolean =>
  el instanceof HTMLElement &&
  (el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' ||
    el.isContentEditable);

const stopTypedKeysFromNav = (e: React.KeyboardEvent) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return; // keep ⌘K et al. working
  if (isTextEntry(e.target)) e.stopPropagation();
};

export default function MarketingHubHero(_props: { host: PropelHeroHost }) {
  return (
    <div
      style={{ display: 'contents' }}
      onKeyDown={stopTypedKeysFromNav}
      onKeyUp={stopTypedKeysFromNav}
    >
      <MarketingHubPage />
    </div>
  );
}
