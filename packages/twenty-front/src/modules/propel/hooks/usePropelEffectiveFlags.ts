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
