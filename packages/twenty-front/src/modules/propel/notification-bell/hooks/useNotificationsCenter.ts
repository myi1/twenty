import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { type NotificationBellItem } from '@/propel/notification-bell/hooks/useNotificationBell';
import { useSecurityEvents } from '@/propel/notification-bell/hooks/useSecurityEvents';
import { useDeleteManyRecords } from '@/object-record/hooks/useDeleteManyRecords';
import { useDeleteOneRecord } from '@/object-record/hooks/useDeleteOneRecord';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { useUpdateManyRecords } from '@/object-record/hooks/useUpdateManyRecords';
import { useListenToEventsForQuery } from '@/sse-db-event/hooks/useListenToEventsForQuery';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useCallback, useMemo, useState } from 'react';

const NOTIFICATIONS_CENTER_LIMIT = 100;

export type NotificationsCenterFilter = 'all' | 'unread';

export const useNotificationsCenter = () => {
  const currentWorkspaceMember = useAtomStateValue(currentWorkspaceMemberState);
  const memberId = currentWorkspaceMember?.id;

  const [readFilter, setReadFilter] = useState<NotificationsCenterFilter>('all');
  const [eventTypeFilter, setEventTypeFilter] = useState<string | null>(null);

  const filter = useMemo(
    () => ({
      and: [
        { recipientWorkspaceMemberId: { eq: memberId ?? '' } },
        { channel: { eq: 'IN_APP' } },
      ],
    }),
    [memberId],
  );

  const {
    records: businessRecords,
    loading,
    fetchMoreRecords,
    hasNextPage,
    refetch,
  } = useFindManyRecords<NotificationBellItem>({
    objectNameSingular: 'notificationLog',
    filter,
    orderBy: [{ sentAt: 'DescNullsLast' }],
    limit: NOTIFICATIONS_CENTER_LIMIT,
    skip: memberId === undefined,
    fetchPolicy: 'cache-and-network',
  });

  // Real-time — same mechanism as the bell (see useNotificationBell.ts), sized to
  // this page's larger limit.
  const operationSignature = useMemo(
    () => ({
      objectNameSingular: 'notificationLog',
      variables: {
        filter,
        orderBy: [{ sentAt: 'DescNullsLast' as const }],
        limit: NOTIFICATIONS_CENTER_LIMIT,
      },
    }),
    [filter],
  );
  useListenToEventsForQuery({ queryId: 'notifications-center', operationSignature });

  const securityEvents = useSecurityEvents();

  // Security events aren't paginated (there are only ever two kinds, and the core
  // resolver returns the most recent 30) — merge is a plain concat/sort, no
  // cross-source pagination to reconcile.
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
    return merged;
  }, [businessRecords, securityEvents.records]);

  // The event types actually present in what's loaded — drives the filter chips
  // without hardcoding/guessing which of the catalog events this member has ever
  // actually received.
  const availableEventTypes = useMemo(() => {
    const set = new Set<string>();
    for (const record of records) {
      if (record.eventType) set.add(record.eventType);
    }
    return Array.from(set);
  }, [records]);

  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      if (readFilter === 'unread' && record.readAt) return false;
      if (eventTypeFilter !== null && record.eventType !== eventTypeFilter) {
        return false;
      }
      return true;
    });
  }, [records, readFilter, eventTypeFilter]);

  const unreadCount = records.filter((record) => !record.readAt).length;

  const { updateManyRecords } = useUpdateManyRecords({
    objectNameSingular: 'notificationLog',
  });
  const { deleteOneRecord } = useDeleteOneRecord({
    objectNameSingular: 'notificationLog',
  });
  const { deleteManyRecords } = useDeleteManyRecords({
    objectNameSingular: 'notificationLog',
  });

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
    refetch();
  }, [businessRecords, updateManyRecords, securityEvents, refetch]);

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
      refetch();
    },
    [updateManyRecords, securityEvents, refetch],
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
      refetch();
    },
    [updateManyRecords, securityEvents, refetch],
  );

  const toggleRead = useCallback(
    async (id: string, isCurrentlyRead: boolean, source?: 'business' | 'security') => {
      if (isCurrentlyRead) await markOneAsUnread(id, source);
      else await markOneAsRead(id, source);
    },
    [markOneAsUnread, markOneAsRead],
  );

  // Security events have no delete — they're a fixed account-security audit trail,
  // not a dismissible feed item. Deleting only ever targets business notifications.
  const deleteOne = useCallback(
    async (id: string) => {
      await deleteOneRecord(id);
      refetch();
    },
    [deleteOneRecord, refetch],
  );

  const deleteAllRead = useCallback(async () => {
    const readIds = businessRecords.filter((record) => record.readAt).map((record) => record.id);
    if (readIds.length === 0) return;
    await deleteManyRecords({ recordIdsToDelete: readIds });
    refetch();
  }, [businessRecords, deleteManyRecords, refetch]);

  return {
    records: filteredRecords,
    totalCount: records.length,
    unreadCount,
    availableEventTypes,
    readFilter,
    setReadFilter,
    eventTypeFilter,
    setEventTypeFilter,
    loading: loading || securityEvents.loading,
    hasNextPage,
    fetchMoreRecords,
    markAllAsRead,
    markOneAsRead,
    toggleRead,
    deleteOne,
    deleteAllRead,
  };
};
