import { type NotificationBellItem } from '@/propel/notification-bell/hooks/useNotificationBell';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { useMemo } from 'react';

// subjectObjectType -> { objectNameSingular, pick the field(s) that give a display label }.
// CONVERSATION + POOL have no single record route (see NOTIF_SUBJECT_ROUTE_NAME) so they're
// omitted here too — nothing to look up.
const SUBJECT_OBJECT_NAME_SINGULAR: Record<string, string> = {
  PERSON: 'person',
  SECONDARY: 'secondaryOpportunity',
  SELL: 'sellOpportunity',
  OFFPLAN: 'offPlanOpportunity',
  INSTITUTIONAL: 'institutionalOpportunity',
  RCBI: 'rcbiOpportunity',
  DEAL: 'deal',
  TASK: 'task',
  LISTING: 'listing',
};

type SubjectRecord = {
  __typename: string;
  id: string;
  // Person's `name` field is Twenty's FullName composite type — a nested
  // { firstName, lastName } object. The propel opportunity/deal/listing objects'
  // `name` field is a plain TEXT string. Same field name, different shape per object.
  name?: string | { firstName?: string | null; lastName?: string | null } | null;
  title?: string | null;
};

const labelFromRecord = (record: SubjectRecord | undefined): string | null => {
  if (!record) return null;
  if (typeof record.title === 'string' && record.title.length > 0) {
    return record.title;
  }
  if (record.name && typeof record.name === 'object') {
    const fullName = [record.name.firstName, record.name.lastName]
      .filter((part): part is string => typeof part === 'string' && part.length > 0)
      .join(' ');
    if (fullName.length > 0) return fullName;
  }
  if (typeof record.name === 'string' && record.name.length > 0) {
    return record.name;
  }
  return null;
};

// Explicit field selection per subject type — useFindManyRecords' default field set
// varies by object and isn't guaranteed to include what we need (confirmed: Task's
// default included `title`, Person's did not include the composite `name` field), so
// request exactly what labelFromRecord() reads rather than relying on the default.
//
// CRITICAL: once `recordGqlFields` is passed, shouldFieldBeQueried() switches to
// whitelist mode — ONLY fields listed here are queried, `id` is NOT auto-included
// (confirmed in mapObjectMetadataToGraphQLQuery.ts / shouldFieldBeQueried.ts). Omitting
// `id: true` silently drops it from every response, breaking the `record.id` keying
// this whole lookup depends on — for every subject type, not just the one you're
// editing. Every entry below MUST include `id: true`.
const SUBJECT_RECORD_GQL_FIELDS: Record<string, Record<string, unknown>> = {
  PERSON: { id: true, name: { firstName: true, lastName: true } },
  TASK: { id: true, title: true },
  SECONDARY: { id: true, name: true },
  SELL: { id: true, name: true },
  OFFPLAN: { id: true, name: true },
  INSTITUTIONAL: { id: true, name: true },
  RCBI: { id: true, name: true },
  DEAL: { id: true, name: true },
  LISTING: { id: true, name: true },
};

// One useFindManyRecords call PER known subject type (fixed set — Rules of Hooks), each
// skipped when the current page has no items of that type. Batches all ids of that type
// into a single `id IN (...)` query rather than one request per notification.
const useSubjectTypeLabels = (
  subjectType: string,
  ids: string[],
): Record<string, string> => {
  const { records } = useFindManyRecords<SubjectRecord>({
    objectNameSingular: SUBJECT_OBJECT_NAME_SINGULAR[subjectType],
    filter: { id: { in: ids } },
    recordGqlFields: SUBJECT_RECORD_GQL_FIELDS[subjectType],
    skip: ids.length === 0,
  });
  return useMemo(() => {
    const map: Record<string, string> = {};
    for (const record of records) {
      const label = labelFromRecord(record);
      if (label) map[record.id] = label;
    }
    return map;
  }, [records]);
};

// Returns a map keyed `${subjectObjectType}:${subjectRecordId}` -> display label (e.g. the
// person's name, the task's title), for every item that has both a known subject type and
// a record id. Items with no match (deleted record, unsupported type) just get no detail —
// callers fall back to the generic event label alone.
export const useNotificationSubjectLabels = (
  items: NotificationBellItem[],
): Record<string, string> => {
  const idsByType = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const item of items) {
      if (!item.subjectObjectType || !item.subjectRecordId) continue;
      if (!SUBJECT_OBJECT_NAME_SINGULAR[item.subjectObjectType]) continue;
      const key = item.subjectObjectType;
      map[key] = map[key] ?? [];
      if (!map[key].includes(item.subjectRecordId)) {
        map[key].push(item.subjectRecordId);
      }
    }
    return map;
  }, [items]);

  const personLabels = useSubjectTypeLabels('PERSON', idsByType.PERSON ?? []);
  const secondaryLabels = useSubjectTypeLabels('SECONDARY', idsByType.SECONDARY ?? []);
  const sellLabels = useSubjectTypeLabels('SELL', idsByType.SELL ?? []);
  const offplanLabels = useSubjectTypeLabels('OFFPLAN', idsByType.OFFPLAN ?? []);
  const institutionalLabels = useSubjectTypeLabels(
    'INSTITUTIONAL',
    idsByType.INSTITUTIONAL ?? [],
  );
  const rcbiLabels = useSubjectTypeLabels('RCBI', idsByType.RCBI ?? []);
  const dealLabels = useSubjectTypeLabels('DEAL', idsByType.DEAL ?? []);
  const taskLabels = useSubjectTypeLabels('TASK', idsByType.TASK ?? []);
  const listingLabels = useSubjectTypeLabels('LISTING', idsByType.LISTING ?? []);

  return useMemo(() => {
    const byType: Record<string, Record<string, string>> = {
      PERSON: personLabels,
      SECONDARY: secondaryLabels,
      SELL: sellLabels,
      OFFPLAN: offplanLabels,
      INSTITUTIONAL: institutionalLabels,
      RCBI: rcbiLabels,
      DEAL: dealLabels,
      TASK: taskLabels,
      LISTING: listingLabels,
    };
    const result: Record<string, string> = {};
    for (const item of items) {
      if (!item.subjectObjectType || !item.subjectRecordId) continue;
      const label = byType[item.subjectObjectType]?.[item.subjectRecordId];
      if (label) {
        result[`${item.subjectObjectType}:${item.subjectRecordId}`] = label;
      }
    }
    return result;
  }, [
    items,
    personLabels,
    secondaryLabels,
    sellLabels,
    offplanLabels,
    institutionalLabels,
    rcbiLabels,
    dealLabels,
    taskLabels,
    listingLabels,
  ]);
};
