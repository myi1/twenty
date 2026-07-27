import { type NotificationBellItem } from '@/propel/notification-bell/hooks/useNotificationBell';
import {
  GET_MY_SECURITY_EVENTS,
  MARK_ALL_SECURITY_EVENTS_AS_READ,
  MARK_SECURITY_EVENTS_AS_READ,
  MARK_SECURITY_EVENTS_AS_UNREAD,
} from '@/propel/notification-bell/graphql/mySecurityEvents';
import { useMutation, useQuery } from '@apollo/client/react';
import { useCallback } from 'react';

type SecurityEventRecord = {
  __typename?: string;
  id: string;
  eventType: string;
  createdAt: string;
  readAt: string | null;
};

// Account-level security events (login, password change — see security-event.entity.ts
// in twenty-server core). A SEPARATE source from the per-workspace notificationLog
// object the rest of the bell reads via useFindManyRecords — these come from a core
// (cross-workspace) GraphQL resolver instead, so they need their own query/mutations.
export const useSecurityEvents = () => {
  const { data, loading, refetch } = useQuery<{
    mySecurityEvents: SecurityEventRecord[];
  }>(GET_MY_SECURITY_EVENTS, { fetchPolicy: 'cache-and-network' });

  const [markSecurityEventsAsReadMutation] = useMutation(
    MARK_SECURITY_EVENTS_AS_READ,
  );
  const [markSecurityEventsAsUnreadMutation] = useMutation(
    MARK_SECURITY_EVENTS_AS_UNREAD,
  );
  const [markAllSecurityEventsAsReadMutation] = useMutation(
    MARK_ALL_SECURITY_EVENTS_AS_READ,
  );

  const records: NotificationBellItem[] = (data?.mySecurityEvents ?? []).map(
    (event) => ({
      __typename: 'SecurityEvent',
      id: event.id,
      eventType: event.eventType,
      subjectObjectType: null,
      subjectRecordId: null,
      sentAt: event.createdAt,
      readAt: event.readAt,
      source: 'security',
    }),
  );

  const markAsRead = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      await markSecurityEventsAsReadMutation({ variables: { ids } });
      refetch();
    },
    [markSecurityEventsAsReadMutation, refetch],
  );

  const markAsUnread = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      await markSecurityEventsAsUnreadMutation({ variables: { ids } });
      refetch();
    },
    [markSecurityEventsAsUnreadMutation, refetch],
  );

  const markAllAsRead = useCallback(async () => {
    await markAllSecurityEventsAsReadMutation();
    refetch();
  }, [markAllSecurityEventsAsReadMutation, refetch]);

  return { records, loading, markAsRead, markAsUnread, markAllAsRead, refetch };
};
