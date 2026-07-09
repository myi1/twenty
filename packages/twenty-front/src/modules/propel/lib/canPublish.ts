import { useEffect, useState } from 'react';
import { getTokenPair } from '@/apollo/utils/getTokenPair';
import { REACT_APP_SERVER_BASE_URL } from '~/config';

// The marketing-publish capability probe (maker-checker Phase 2, UI leg).
//
// The gate is BACKEND-enforced — every publish/go-live/send route independently
// resolves the acting member's role and refuses a non-publisher. This hook is
// UI-ONLY convenience: it decides whether the hero shows the Night Desk (a
// publisher's sign-off home) or the agent "My Desk", and whether a surface offers
// "Publish" vs "Submit for approval".
//
// canPublish = the caller resolves to ADMIN (any role with canUpdateAllSettings —
// admins publish by design, their flag set is empty) OR the caller holds the app
// permission flag `PROPEL_MARKETING_PUBLISH`.
//
// Source: the SAME `/metadata currentUser` read the platform already trusts.
// `currentUser.workspaceMember.roles { canUpdateAllSettings permissionFlags { flag } }`
// is readable by ANY authenticated caller (NOT settings-gated, unlike getRoles),
// and `permissionFlags.flag` is a plain STRING so an app-defined flag surfaces
// (the enum-typed `currentUserWorkspace.permissionFlags` would drop it). currentUser
// lives on the `/metadata` endpoint (NOT `/graphql`).
//
// Fail-closed: an unknown/missing/failed read → NOT a publisher (the agent view).
// This is the safe default — an agent mistakenly shown "Submit for approval" is
// harmless; a manager mis-shown "Submit" still has the backend gate. While the
// probe is in flight `loading` is true (the branch shows a neutral spinner).

export const MARKETING_PUBLISH_FLAG = 'PROPEL_MARKETING_PUBLISH';

const QUERY = `query PropelCanPublish {
  currentUser {
    id
    workspaceMember {
      id
      roles {
        id
        label
        canUpdateAllSettings
        permissionFlags {
          flag
        }
      }
    }
  }
}`;

interface RoleShape {
  canUpdateAllSettings?: boolean | null;
  permissionFlags?: Array<{ flag?: string | null } | null> | null;
}

// Tolerant walk of the metadata response → the publish verdict. Any missing layer
// collapses to false rather than throwing.
const readCanPublish = (json: unknown): boolean => {
  if (json === null || typeof json !== 'object') return false;
  const data = (json as { data?: unknown }).data;
  if (data === null || typeof data !== 'object') return false;
  const user = (data as { currentUser?: unknown }).currentUser;
  if (user === null || typeof user !== 'object') return false;
  const member = (user as { workspaceMember?: unknown }).workspaceMember;
  if (member === null || typeof member !== 'object') return false;
  const roles = (member as { roles?: unknown }).roles;
  if (!Array.isArray(roles)) return false;
  for (const raw of roles) {
    if (raw === null || typeof raw !== 'object') continue;
    const role = raw as RoleShape;
    if (role.canUpdateAllSettings === true) return true;
    const flags = role.permissionFlags;
    if (Array.isArray(flags)) {
      for (const f of flags) {
        if (f !== null && typeof f === 'object' && f.flag === MARKETING_PUBLISH_FLAG) {
          return true;
        }
      }
    }
  }
  return false;
};

// One-shot fetch of the publish verdict. Resolves false on any failure (unsigned,
// non-2xx, network, GraphQL error, malformed body) — fail-closed to the agent view.
export const fetchCanPublish = async (): Promise<boolean> => {
  const token = getTokenPair()?.accessOrWorkspaceAgnosticToken?.token;
  if (token === undefined || token === '') return false;
  try {
    const res = await fetch(`${REACT_APP_SERVER_BASE_URL}/metadata`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query: QUERY }),
    });
    if (!res.ok) return false;
    const json = (await res.json()) as unknown;
    return readCanPublish(json);
  } catch {
    return false;
  }
};

export interface CanPublishState {
  canPublish: boolean;
  loading: boolean;
}

// The hero-level publish-capability hook. `loading` is true until the probe
// settles; `canPublish` defaults to false (agent view) and only flips true when
// the metadata read proves ADMIN or the marketing-publish flag.
export const useCanPublish = (): CanPublishState => {
  const [state, setState] = useState<CanPublishState>({
    canPublish: false,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    void fetchCanPublish()
      .then((canPublish) => {
        if (!cancelled) setState({ canPublish, loading: false });
      })
      .catch(() => {
        if (!cancelled) setState({ canPublish: false, loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
};
