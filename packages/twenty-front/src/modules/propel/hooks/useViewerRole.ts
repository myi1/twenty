import { useEffect, useState } from 'react';
import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import { type InboxViewerRole } from '@/propel/types/inbox';

// Hero-level role probe. Reads the acting member's Propel role (ADMIN | MANAGER |
// AGENT) so the Marketing hero can hide manager/admin-only tabs (e.g. Lead Routing)
// from agents. Uses the SAME server-authoritative signal the Inbox triage controls
// trust — `viewerRole` from the live, UNCHANGED `/marketing/inbox` route (a flat,
// empty-body read; CRM-app untouched). The route derives identity server-side from
// the bearer token (resolveActingMember), so the role can't be spoofed client-side.
//
// This is a SOFT gate for UX only — every Lead Routing WRITE is independently
// fail-closed server-side (the /lead/source-config route returns NOT_FOUND for a
// non-manager), so a stale/absent role here can never grant write access. While the
// probe is in flight the role is `null`; callers treat null as "not yet known"
// (tab stays hidden until proven manager/admin), and a network failure leaves it
// null (fail-closed for the tab, never a flash of a forbidden surface).

type Phase = 'loading' | 'ready';

export const useViewerRole = (): { role: InboxViewerRole | null; phase: Phase } => {
  const [role, setRole] = useState<InboxViewerRole | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');

  useEffect(() => {
    let cancelled = false;
    void callPropelRoute<{ viewerRole?: InboxViewerRole }>(
      '/marketing/inbox',
      {},
    )
      .then((res) => {
        if (cancelled) return;
        setRole(res?.viewerRole ?? null);
      })
      .catch(() => {
        if (!cancelled) setRole(null);
      })
      .finally(() => {
        if (!cancelled) setPhase('ready');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { role, phase };
};

export const isManagerRole = (role: InboxViewerRole | null): boolean =>
  role === 'MANAGER' || role === 'ADMIN';
