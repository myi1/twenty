import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { useUpdateManyRecords } from '@/object-record/hooks/useUpdateManyRecords';
import { NOTIF_EVENT_LABELS } from '@/propel/notification-bell/constants/notificationEventLabels';
import { useSecurityEvents } from '@/propel/notification-bell/hooks/useSecurityEvents';
import { useListenToEventsForQuery } from '@/sse-db-event/hooks/useListenToEventsForQuery';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useCallback, useEffect, useMemo, useRef } from 'react';

export type NotificationBellItem = {
  __typename: string;
  id: string;
  eventType: string | null;
  subjectObjectType: string | null;
  subjectRecordId: string | null;
  sentAt: string | null;
  readAt: string | null;
  // 'security' items come from the core SecurityEvent table (login/password-change
  // — see useSecurityEvents.ts), not the per-workspace notificationLog object.
  // Absent/'business' is the existing default — every current caller of this type
  // is unaffected.
  source?: 'business' | 'security';
};

const NOTIFICATION_BELL_LIMIT = 30;
// Real-time (SSE) delivery covers new notificationLog rows instantly (see
// useListenToEventsForQuery below); this poll is now just a fallback safety net
// (missed SSE reconnect, etc), so a slower cadence is fine.
const NOTIFICATION_BELL_POLL_MS = 60_000;

export const useNotificationBell = () => {
  const currentWorkspaceMember = useAtomStateValue(currentWorkspaceMemberState);
  const memberId = currentWorkspaceMember?.id;
  const { enqueueInfoSnackBar } = useSnackBar();

  const filter = useMemo(
    () => ({
      and: [
        { recipientWorkspaceMemberId: { eq: memberId ?? '' } },
        { channel: { eq: 'IN_APP' } },
      ],
    }),
    [memberId],
  );

  const { records: businessRecords, loading, refetch } = useFindManyRecords<NotificationBellItem>({
    objectNameSingular: 'notificationLog',
    filter,
    orderBy: [{ sentAt: 'DescNullsLast' }],
    limit: NOTIFICATION_BELL_LIMIT,
    skip: memberId === undefined,
    fetchPolicy: 'cache-and-network',
  });

  // Real-time: new/updated notificationLog rows matching this exact query shape
  // patch the Apollo cache the instant they happen (server → Redis pub/sub → SSE
  // stream), no poll needed for the common case.
  const operationSignature = useMemo(
    () => ({
      objectNameSingular: 'notificationLog',
      variables: {
        filter,
        orderBy: [{ sentAt: 'DescNullsLast' as const }],
        limit: NOTIFICATION_BELL_LIMIT,
      },
    }),
    [filter],
  );
  useListenToEventsForQuery({ queryId: 'notification-bell', operationSignature });

  const { updateManyRecords } = useUpdateManyRecords({
    objectNameSingular: 'notificationLog',
  });

  const securityEvents = useSecurityEvents();

  // Fallback poll — paused while the tab is hidden, matching the Inbox's
  // established pattern. Covers BOTH sources: business notificationLog rows have
  // SSE for the instant case (this is just a safety net for a missed reconnect),
  // but security events have no real-time push at all yet (see useSecurityEvents.ts
  // — building that would need its own dedicated SSE client, disproportionate for
  // just 2 low-frequency event types), so this poll is their ONLY refresh path.
  const securityEventsRefetchRef = useRef(securityEvents.refetch);
  securityEventsRefetchRef.current = securityEvents.refetch;
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;
  useEffect(() => {
    if (memberId === undefined) return;
    const tick = () => {
      if (!document.hidden) {
        refetchRef.current();
        securityEventsRefetchRef.current();
      }
    };
    const interval = setInterval(tick, NOTIFICATION_BELL_POLL_MS);
    return () => clearInterval(interval);
  }, [memberId]);

  const records = useMemo(() => {
    const merged = [
      ...businessRecords.map((record) => ({ ...record, source: 'business' as const })),
      ...securityEvents.records,
    ];
    merged.sort((a, b) => {
      const aMs = a.sentAt ? Date.parse(a.sentAt) : 0;
      const bMs = b.sentAt ? Date.parse(b.sentAt) : 0;
      return bMs - aMs;
    });
    return merged.slice(0, NOTIFICATION_BELL_LIMIT);
  }, [businessRecords, securityEvents.records]);

  // Toast + native browser notification for genuinely NEW unread items — never
  // fires for the first batch a session loads (that would toast-storm existing
  // unread history), only for ones that show up afterwards.
  const seenIdsRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    const unreadIds = records.filter((record) => !record.readAt).map((record) => record.id);
    if (seenIdsRef.current === null) {
      seenIdsRef.current = new Set(unreadIds);
      return;
    }
    const newlyArrived = records.filter(
      (record) => !record.readAt && !seenIdsRef.current?.has(record.id),
    );
    for (const record of newlyArrived) {
      const label =
        (record.eventType && NOTIF_EVENT_LABELS[record.eventType]) ??
        record.eventType ??
        'Notification';
      enqueueInfoSnackBar({ message: label, options: { duration: 5000 } });
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(label);
      }
    }
    seenIdsRef.current = new Set(unreadIds);
  }, [records, enqueueInfoSnackBar]);

  const unreadCount = records.filter((record) => !record.readAt).length;

  const markAllAsRead = useCallback(async () => {
    const unreadBusinessIds = businessRecords
      .filter((record) => !record.readAt)
      .map((record) => record.id);
    if (unreadBusinessIds.length > 0) {
      await updateManyRecords({
        recordIdsToUpdate: unreadBusinessIds,
        updateOneRecordInput: { readAt: new Date().toISOString() },
      });
    }
    await securityEvents.markAllAsRead();
    refetchRef.current();
  }, [businessRecords, updateManyRecords, securityEvents]);

  const markOneAsRead = useCallback(
    async (id: string, source?: 'business' | 'security') => {
      if (source === 'security') {
        await securityEvents.markAsRead([id]);
        return;
      }
      await updateManyRecords({
        recordIdsToUpdate: [id],
        updateOneRecordInput: { readAt: new Date().toISOString() },
      });
      refetchRef.current();
    },
    [updateManyRecords, securityEvents],
  );

  const markOneAsUnread = useCallback(
    async (id: string, source?: 'business' | 'security') => {
      if (source === 'security') {
        await securityEvents.markAsUnread([id]);
        return;
      }
      await updateManyRecords({
        recordIdsToUpdate: [id],
        updateOneRecordInput: { readAt: null },
      });
      refetchRef.current();
    },
    [updateManyRecords, securityEvents],
  );

  return {
    records,
    unreadCount,
    loading: loading || securityEvents.loading,
    markAllAsRead,
    markOneAsRead,
    markOneAsUnread,
  };
};
