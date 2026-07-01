import { useMemo } from 'react';

import { gql } from '@apollo/client';
import { useQuery } from '@apollo/client/react';

import { currentUserWorkspaceState } from '@/auth/states/currentUserWorkspaceState';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';

// Resolves the user's EFFECTIVE permission-flag set for the propel
// hero-gating layer.
//
//   effective = (roleFlags ∪ serverEffective ∪ additionalFlags) \ excludedFlags
//
// - serverEffective: currentUserWorkspace.propelEffectiveFlags — computed
//   SERVER-SIDE (permissions.service.ts → computePropelEffectiveFlags): the
//   role's APP flag keys (PROPEL_INBOX, …) folded with this member's
//   additionalFlags/excludedFlags, exclude-wins. This is the ONLY transport
//   for role-granted PROPEL_* keys: the native permissionFlags field is the
//   core PermissionFlagType enum and silently drops custom app flags —
//   2026-07-31 lesson: for a month only members with hand-set additionalFlags
//   saw any gated hero, because this field was missing from the engine.
// - roleFlags: the native permissionFlags (built-in Twenty keys) — kept in the
//   union for any built-in-keyed gates.
// - additionalFlags / excludedFlags: propel-custom MULTI_SELECT fields on
//   the workspaceMember OBJECT (workspace schema — see
//   workspace-member-additional-flags.field.ts). ROOT-CAUSE NOTE (2026-07-08):
//   these used to be requested through the CORE currentUser query, whose
//   WorkspaceMember type never exposed them — every currentUser (re)load
//   failed GraphQL validation silently, so the flags never reached the client
//   and mid-session auth-state refreshes were broken app-wide ("heroes vanish
//   until re-login"). They are now fetched where they actually live: the
//   workspace RECORD API, via a direct minimal query below. Deliberately NOT
//   useFindOneRecord — that hook throws ObjectMetadataItemNotFoundError when
//   object metadata hasn't loaded yet, which would crash the nav drawer at
//   boot; this query has zero metadata-store dependency and fails soft.
//
// EXCLUDE WINS on conflict — by design (a flag in both `additional` and
// `excluded` resolves to NOT visible). Matches the docstring on the field
// definitions + the design in docs/RLS-CONFIG-SYSTEM-DESIGN.md (v2) §5.
//
// This is a COSMETIC gate (matches the propel-nav-filter posture). Backend
// routes / RLS hooks remain the security boundary. A user who edits this
// hook's output in DevTools still hits an empty data set behind any gated
// surface.

const FIND_MEMBER_FLAGS = gql`
  query PropelFindMemberFlags($memberId: UUID!) {
    workspaceMember(filter: { id: { eq: $memberId } }) {
      id
      additionalFlags
      excludedFlags
    }
  }
`;

// LAST-KNOWN-GOOD cache: the source states are client caches that other code
// paths can overwrite mid-session with partial payloads. Once a non-empty flag
// set has been seen for a member this session, keep serving it whenever the
// sources go temporarily empty. Fresh data overwrites the cache on arrival; a
// genuine mid-session revocation applies on the next full load — an acceptable
// trade for a cosmetic gate.
let lastKnownGoodFlags: {
  memberId: string;
  flags: ReadonlySet<string>;
} | null = null;

export const usePropelEffectiveFlags = (): ReadonlySet<string> => {
  const currentUserWorkspace = useAtomStateValue(currentUserWorkspaceState);
  const currentWorkspaceMember = useAtomStateValue(currentWorkspaceMemberState);
  const apolloCoreClient = useApolloCoreClient();

  const memberId = currentWorkspaceMember?.id;

  // The member's own record via the workspace RECORD API — the only transport
  // that actually carries the custom flag fields. Apollo-cached across the
  // session; skipped until the member id is known (pre-auth / boot); errors
  // tolerated (data stays undefined → role flags / last-known-good carry).
  const { data } = useQuery<{
    workspaceMember?: {
      id: string;
      additionalFlags?: string[] | null;
      excludedFlags?: string[] | null;
    } | null;
  }>(FIND_MEMBER_FLAGS, {
    client: apolloCoreClient,
    variables: { memberId: memberId ?? '' },
    skip: memberId === undefined || memberId === '',
    errorPolicy: 'all',
  });

  return useMemo(() => {
    const roleFlags = currentUserWorkspace?.permissionFlags ?? [];
    // Server-computed effective set (role app-flags + per-member overrides,
    // exclude-wins already applied). Empty on a server predating the field —
    // the member-override fallback below still carries hand-set flags then.
    const serverEffective =
      (currentUserWorkspace as { propelEffectiveFlags?: string[] | null } | null)
        ?.propelEffectiveFlags ?? [];
    // MULTI_SELECT custom fields → string[] of option values (the flag KEY
    // strings), or null/undefined when unset or the propel app is absent.
    const additional = data?.workspaceMember?.additionalFlags ?? [];
    const excluded = data?.workspaceMember?.excludedFlags ?? [];

    const merged = new Set<string>(roleFlags);
    for (const f of serverEffective) merged.add(f);
    for (const f of additional) merged.add(f);
    for (const f of excluded) merged.delete(f); // exclude wins

    if (
      memberId !== undefined &&
      lastKnownGoodFlags !== null &&
      lastKnownGoodFlags.memberId !== memberId
    ) {
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
  }, [currentUserWorkspace, data, memberId]);
};

// Convenience predicate. Mirrors the shape of Twenty's useHasPermissionFlag
// but keyed on the propel-effective set (which Twenty's native hook does NOT
// know about — Twenty only sees role-level flags).
export const usePropelHasEffectiveFlag = (flagKey: string): boolean => {
  const flags = usePropelEffectiveFlags();
  return flags.has(flagKey);
};
