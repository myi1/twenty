import { type NotificationBellItem } from '@/propel/notification-bell/hooks/useNotificationBell';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { useMemo } from 'react';

// A "your lead replied" / "dormant lead re-engaged" notification's subject is the
// PERSON (that's all notify-agent has at write time) — but clicking it should open
// the actual WhatsApp thread, not just the person's generic CRM profile. This maps
// personId -> their whatsAppConversation id (contact is a many-to-one from
// whatsAppConversation to person, joinColumnName `contactId`) so those two event
// types can route straight to the conversation.
const WHATSAPP_EVENT_TYPES = new Set(['LEAD_REPLIED', 'DORMANT_REENGAGED']);

type WaConversationRecord = {
  __typename: string;
  id: string;
  contactId?: string | null;
  lastMessageAt?: string | null;
};

export const useNotificationWaConversationRoutes = (
  items: NotificationBellItem[],
): Record<string, string> => {
  const personIds = useMemo(() => {
    const ids = new Set<string>();
    for (const item of items) {
      if (
        item.subjectObjectType === 'PERSON' &&
        item.subjectRecordId &&
        item.eventType &&
        WHATSAPP_EVENT_TYPES.has(item.eventType)
      ) {
        ids.add(item.subjectRecordId);
      }
    }
    return Array.from(ids);
  }, [items]);

  const { records } = useFindManyRecords<WaConversationRecord>({
    objectNameSingular: 'whatsAppConversation',
    filter: { contactId: { in: personIds } },
    recordGqlFields: { id: true, contactId: true, lastMessageAt: true },
    orderBy: [{ lastMessageAt: 'DescNullsLast' }],
    skip: personIds.length === 0,
  });

  // personId -> most-recent conversation id (a contact could have more than one
  // conversation, e.g. across WA lines — records are ordered by lastMessageAt desc,
  // so the first one seen per contactId wins).
  return useMemo(() => {
    const map: Record<string, string> = {};
    for (const record of records) {
      if (record.contactId && !map[record.contactId]) {
        map[record.contactId] = record.id;
      }
    }
    return map;
  }, [records]);
};
