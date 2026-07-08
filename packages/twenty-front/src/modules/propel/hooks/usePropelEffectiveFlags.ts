import { useMemo } from 'react';

import { currentUserWorkspaceState } from '@/auth/states/currentUserWorkspaceState';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';

// Resolves the user's EFFECTIVE permission-flag set for the propel
// hero-gating layer.
//
//   effective = (roleFlags ∪ additionalFlags) \ excludedFlags
//
// - roleFlags: server-computed at the User.currentUserWorkspace.permissionFlags
//   field (Twenty native — derived from the user's role's
//   permissionFlagUniversalIdentifiers). Includes built-in Twenty flag keys
//   AND the propel app's flag keys (PROPEL_INBOX, PROPEL_MARKETING_HUB, …).
// - additionalFlags / excludedFlags: propel-custom MULTI_SELECT fields on
//   the currentWorkspaceMember (see workspace-member-additional-flags.field.ts /
//   workspace-member-excluded-flags.field.ts). Option `value`s mirror the
//   permission-flag KEYS exactly.
//
// EXCLUDE WINS on conflict — by design (a flag in both `additional` and
// `excluded` resolves to NOT visible). Matches the docstring on the field
// definitions + the design in docs/RLS-CONFIG-SYSTEM-DESIGN.md (v2) §5.
//
// This is a COSMETIC gate (matches the propel-nav-filter posture). Backend
// routes / RLS hooks remain the security boundary. A user who edits this
// hook's output in DevTools still hits an empty data set behind any gated
// surface.
// LAST-KNOWN-GOOD cache (recurring "heroes vanished from nav" bug, 2026-07-08):
// the two source states below are client caches that other code paths can
// overwrite mid-session with PARTIAL payloads (a mutation response writing a
// member object without the custom additionalFlags fields, a
// currentUserWorkspace update without permissionFlags, …). When that happens
// the resolved set reads empty, the sidebar filters out EVERY hero, and only a
// re-login (full currentUser query) recovers. Since this gate is COSMETIC
// (backend routes/RLS stay the security boundary), the resilient posture is:
// once a non-empty flag set has been seen for a member this session, keep
// serving it whenever the sources go temporarily empty. Fresh data overwrites
// the cache on arrival; a genuine mid-session revocation applies on the next
// full load — an acceptable trade for a cosmetic gate.
let lastKnownGoodFlags: {
  memberId: string;
  flags: ReadonlySet<string>;
} | null = null;

export const usePropelEffectiveFlags = (): ReadonlySet<string> => {
  const currentUserWorkspace = useAtomStateValue(currentUserWorkspaceState);
  const currentWorkspaceMember = useAtomStateValue(currentWorkspaceMemberState);

  return useMemo(() => {
    const roleFlags = currentUserWorkspace?.permissionFlags ?? [];
    // `additionalFlags` / `excludedFlags` are MULTI_SELECT custom fields →
    // string[] of option values, or null when no custom fields are installed
    // (e.g. a workspace without the propel app, dev fixtures).
    const additional =
      (currentWorkspaceMember as { additionalFlags?: string[] | null } | null)
        ?.additionalFlags ?? [];
    const excluded =
      (currentWorkspaceMember as { excludedFlags?: string[] | null } | null)
        ?.excludedFlags ?? [];

    const merged = new Set<string>(roleFlags);
    for (const f of additional) merged.add(f);
    for (const f of excluded) merged.delete(f); // exclude wins

    const memberId = currentWorkspaceMember?.id;

    if (memberId !== undefined && lastKnownGoodFlags !== null &&
        lastKnownGoodFlags.memberId !== memberId) {
      // Different member (user/workspace switch) → the cached set is not ours.
      lastKnownGoodFlags = null;
    }

    if (merged.size > 0) {
      // Healthy resolution → remember it (only when we know whose it is).
      if (memberId !== undefined) {
        lastKnownGoodFlags = { memberId, flags: merged };
      }
      return merged;
    }

    if (lastKnownGoodFlags !== null) {
      // Sources empty/partial but a healthy set was seen earlier this session
      // for this member (or member state is momentarily gone) → serve the last
      // known good set instead of blanking the hero nav.
      return lastKnownGoodFlags.flags;
    }

    return merged;
  }, [currentUserWorkspace, currentWorkspaceMember]);
};

// Convenience predicate. Mirrors the shape of Twenty's useHasPermissionFlag
// but keyed on the propel-effective set (which Twenty's native hook does NOT
// know about — Twenty only sees role-level flags).
export const usePropelHasEffectiveFlag = (flagKey: string): boolean => {
  const flags = usePropelEffectiveFlags();
  return flags.has(flagKey);
};
