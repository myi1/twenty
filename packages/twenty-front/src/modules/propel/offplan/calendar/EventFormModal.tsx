import { useEffect, useMemo, useRef, useState } from 'react';
import { Autocomplete, Button, Group, Modal, Select, Stack, Text, TextInput, Textarea } from '@mantine/core';
import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import type { RouteEnvelope } from '@/propel/offplan/types';
import type { EventFormValues, MarketEventRecord, MarketEventType } from './types';
import { eventTypeLabel } from './calendarUtils';

// The 20-second add/edit form (managers/partners only — the route re-checks). A
// Mantine Modal, NOT a drawer: it must open even while the project drawer is up,
// and drawer-in-drawer is worse. Select/Autocomplete dropdowns inside a Modal need
// the zIndex bump (the recorded Select-inside-modal gotcha — Modal sits at ~200,
// portal'd dropdowns must clear it). v1 granularity is ALL-DAY dates (the design's
// form default); EOI shows ONE deadline field. developerName is a DEBOUNCED REMOTE
// typeahead against the geniemap developers list (24-row pages — never "load once
// and assume complete"), persisting developerSlug beside the display name; free
// text = slug null.

const DROPDOWN_Z = 5000;

const TYPE_OPTIONS = (Object.keys(eventTypeLabel) as MarketEventType[]).map((value) => ({
  value,
  label: eventTypeLabel[value],
}));

const emptyValues = (prefillDay: string | null): EventFormValues => ({
  eventType: 'DEVELOPER_EVENT',
  name: '',
  startsAt: prefillDay ?? '',
  endsAt: '',
  deadline: prefillDay ?? '',
  developerName: '',
  developerSlug: null,
  sourceNote: '',
  notes: '',
  url: '',
});

const fromRecord = (r: MarketEventRecord): EventFormValues => {
  // Stored all-day instants are Dubai day bounds; recover the calendar day by
  // shifting +4h and taking the date part (display-only mirror of the server rule).
  const key = (iso: string | null): string => {
    if (!iso) return '';
    const d = new Date(Date.parse(iso) + 4 * 3600_000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  };
  return {
    eventType: r.eventType,
    name: r.name,
    startsAt: key(r.startsAt),
    endsAt: r.eventType === 'EOI_DEADLINE' ? '' : key(r.endsAt),
    deadline: key(r.endsAt ?? r.startsAt),
    developerName: r.developerName ?? '',
    developerSlug: r.developerSlug,
    sourceNote: r.sourceNote ?? '',
    notes: r.notes ?? '',
    url: r.url ?? '',
  };
};

type DevOption = { name: string; slug: string };

export const EventFormModal = ({
  opened, editing, prefillDay, onClose, onSaved,
}: {
  opened: boolean;
  /** null = create; a record = edit (full record from the detail action). */
  editing: MarketEventRecord | null;
  prefillDay: string | null;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const [values, setValues] = useState<EventFormValues>(() => emptyValues(prefillDay));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [devOptions, setDevOptions] = useState<DevOption[]>([]);
  const devSeq = useRef(0);
  const devTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!opened) return;
    setValues(editing ? fromRecord(editing) : emptyValues(prefillDay));
    setErrors({});
    setSaveError(null);
    setDevOptions([]);
  }, [opened, editing, prefillDay]);

  const set = <K extends keyof EventFormValues>(k: K, v: EventFormValues[K]) =>
    setValues((prev) => ({ ...prev, [k]: v }));

  const searchDevelopers = (q: string) => {
    set('developerName', q);
    set('developerSlug', devOptions.find((o) => o.name === q)?.slug ?? null);
    if (devTimer.current) clearTimeout(devTimer.current);
    if (q.trim().length < 2) return;
    devTimer.current = setTimeout(async () => {
      const mySeq = ++devSeq.current;
      const res = await callPropelRoute<RouteEnvelope<{ developers?: DevOption[] }>>(
        '/offplan/browse',
        { action: 'developers', params: { q: q.trim() } },
      ).catch(() => null);
      if (mySeq !== devSeq.current) return;
      const list = (res?.ok ? res.data?.developers ?? [] : []).filter((d) => d?.name && d?.slug);
      setDevOptions(list.slice(0, 12));
    }, 250);
  };

  const isEoi = values.eventType === 'EOI_DEADLINE';

  const save = async () => {
    // Inline validation mirrors the route (which re-validates — the route is the control).
    const next: Record<string, string> = {};
    if (!values.name.trim()) next.name = 'Name is required';
    if (isEoi ? !values.deadline : !values.startsAt) next[isEoi ? 'deadline' : 'startsAt'] = 'Required';
    if (!isEoi && values.endsAt && values.endsAt < values.startsAt) next.endsAt = 'End must not be before start';
    if (values.url.trim() && !/^https?:\/\//i.test(values.url.trim())) next.url = 'Link must start with http:// or https://';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    setSaveError(null);
    const input: Record<string, unknown> = {
      name: values.name.trim(),
      eventType: values.eventType,
      isAllDay: true,
      developerName: values.developerName.trim() || null,
      developerSlug: values.developerSlug,
      sourceNote: values.sourceNote.trim() || null,
      notes: values.notes.trim() || null,
      url: values.url.trim() || null,
    };
    if (isEoi) input.deadline = values.deadline;
    else {
      input.startsAt = values.startsAt;
      input.endsAt = values.endsAt || null;
    }
    const res = await callPropelRoute<{ ok?: boolean; code?: string; errors?: Record<string, string>; error?: string }>(
      '/market-events',
      editing ? { action: 'update', id: editing.id, input } : { action: 'create', input },
    ).catch(() => null);
    setSaving(false);
    if (res?.ok) {
      onSaved();
      onClose();
      return;
    }
    if (res?.code === 'VALIDATION' && res.errors) {
      setErrors(res.errors);
      return;
    }
    setSaveError(res?.error ?? "Couldn't save — try again");
  };

  const comboboxProps = useMemo(() => ({ zIndex: DROPDOWN_Z, withinPortal: true }), []);

  return (
    <Modal
      opened={opened}
      onClose={saving ? () => undefined : onClose}
      title={<Text fw={700}>{editing ? 'Edit event' : 'Add event'}</Text>}
      centered
      zIndex={4000}
      returnFocus
      trapFocus
    >
      <Stack gap={10}>
        <Select
          label="What is it?"
          data={TYPE_OPTIONS}
          value={values.eventType}
          onChange={(v) => v && set('eventType', v as MarketEventType)}
          comboboxProps={comboboxProps}
          allowDeselect={false}
        />
        <TextInput
          label="Name"
          placeholder="Sobha broker event — Hartland II sales centre"
          value={values.name}
          onChange={(e) => set('name', e.currentTarget.value)}
          error={errors.name}
          maxLength={200}
          data-autofocus
        />
        {isEoi ? (
          <TextInput
            label="Deadline"
            type="date"
            value={values.deadline}
            onChange={(e) => set('deadline', e.currentTarget.value)}
            error={errors.deadline}
          />
        ) : (
          <Group grow>
            <TextInput
              label="Starts"
              type="date"
              value={values.startsAt}
              onChange={(e) => set('startsAt', e.currentTarget.value)}
              error={errors.startsAt}
            />
            <TextInput
              label="Ends (optional)"
              type="date"
              value={values.endsAt}
              onChange={(e) => set('endsAt', e.currentTarget.value)}
              error={errors.endsAt}
            />
          </Group>
        )}
        <Autocomplete
          label="Developer"
          placeholder="Start typing — matches our data"
          value={values.developerName}
          onChange={searchDevelopers}
          data={devOptions.map((o) => o.name)}
          error={errors.developerName}
          comboboxProps={comboboxProps}
          rightSection={
            values.developerSlug ? <Text size="xs" c="dimmed" pr={6}>matched ✓</Text> : undefined
          }
          rightSectionWidth={values.developerSlug ? 80 : undefined}
        />
        <TextInput
          label="Where did this come from?"
          placeholder="Email from Sobha, 20 Aug"
          value={values.sourceNote}
          onChange={(e) => set('sourceNote', e.currentTarget.value)}
          error={errors.sourceNote}
          maxLength={200}
        />
        <Textarea
          label="Notes (optional)"
          value={values.notes}
          onChange={(e) => set('notes', e.currentTarget.value)}
          error={errors.notes}
          maxLength={2000}
          autosize
          minRows={2}
          maxRows={5}
        />
        <TextInput
          label="Link (optional)"
          placeholder="https://…"
          value={values.url}
          onChange={(e) => set('url', e.currentTarget.value)}
          error={errors.url}
          maxLength={500}
        />
        {saveError && <Text size="sm" c="red">{saveError}</Text>}
        <Group justify="flex-end" gap={8} mt={4}>
          <Button variant="default" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} loading={saving}>
            {editing ? 'Save changes' : 'Save event'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
