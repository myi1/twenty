import { useMemo } from 'react';

import { currentUserWorkspaceState } from '@/auth/states/currentUserWorkspaceState';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';

// Resolves the user's EFFECTIVE permission-flag set for the propel
// hero-gating layer.
//
//   effective = (roleAppFlags ∪ additionalFlags) \ excludedFlags
//
// PRIMARY SOURCE — currentUserWorkspace.propelEffectiveFlags: a NEW string[]
// field computed SERVER-SIDE (see permissions.service.ts →
// computePropelEffectiveFlags). The server already folds in the role's app-flag
// keys (PROPEL_INBOX, …) AND this member's per-agent additionalFlags /
// excludedFlags overrides, with exclude-wins. The role's PROPEL_* keys are NOT
// reachable via currentUserWorkspace.permissionFlags (that field is the Twenty
// core PermissionFlagType enum — PROPEL_* keys are silently dropped there), so
// the server-computed field is the only place they surface.
//
// CLIENT FALLBACK — currentWorkspaceMember.additionalFlags / excludedFlags:
// propel-custom MULTI_SELECT fields (see workspace-member-additional-flags.field
// / .../excluded-flags.field), already fetched on the workspaceMember fragment.
// Merged in below so the gate still honors per-agent overrides even if talking
// to a server that predates propelEffectiveFlags (empty → this fallback carries
// the overrides; role app-flags are simply unavailable in that legacy case).
// When both sources are present the result is identical (idempotent union +
// exclude-wins), so keeping the fallback is harmless.
//
// EXCLUDE WINS on conflict — by design (a flag in both `additional` and
// `excluded` resolves to NOT visible). Matches the server compute + the field
// definitions + docs/RLS-CONFIG-SYSTEM-DESIGN.md (v2) §5.
//
// This is a COSMETIC gate (matches the propel-nav-filter posture). Backend
// routes / RLS hooks remain the security boundary. A user who edits this
// hook's output in DevTools still hits an empty data set behind any gated
// surface.
export const usePropelEffectiveFlags = (): ReadonlySet<string> => {
  const currentUserWorkspace = useAtomStateValue(currentUserWorkspaceState);
  const currentWorkspaceMember = useAtomStateValue(currentWorkspaceMemberState);

  return useMemo(() => {
    // Server-computed effective set (role app-flags + per-agent overrides).
    const serverEffective =
      (
        currentUserWorkspace as {
          propelEffectiveFlags?: string[] | null;
        } | null
      )?.propelEffectiveFlags ?? [];

    // `additionalFlags` / `excludedFlags` are MULTI_SELECT custom fields →
    // string[] of option values, or null when no custom fields are installed
    // (e.g. a workspace without the propel app, dev fixtures). Kept as a
    // harmless fallback for legacy servers (see docstring above).
    const additional =
      (currentWorkspaceMember as { additionalFlags?: string[] | null } | null)
        ?.additionalFlags ?? [];
    const excluded =
      (currentWorkspaceMember as { excludedFlags?: string[] | null } | null)
        ?.excludedFlags ?? [];

    const merged = new Set<string>(serverEffective);
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
