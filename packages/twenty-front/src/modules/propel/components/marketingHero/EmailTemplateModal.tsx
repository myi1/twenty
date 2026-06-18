import {
  Box,
  Button,
  Group,
  Modal,
  SegmentedControl,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useMemo, useRef, useState } from 'react';
import { usePropelToast } from '@/propel/hooks/usePropelToast';
import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import {
  MERGE_FIELDS_V1,
  type MergeValues,
  parseTemplate,
  renderParsed,
} from '@/propel/lib/campaignRenderer';
import {
  type CustomFieldOption,
  type EmailTemplateOption,
} from '@/propel/types/marketingHome';

// The email twin of the WhatsApp template editor — a Mantine modal rebuild of the
// legacy EmailTemplateEditorSheet (marketing-cloud-tpleditors.tsx). Subject + body
// with cursor-true {{mergeField}} insert chips (built-in fields + custom-field
// snippets) and a LIVE preview via the REAL renderer (campaignRenderer — the same
// parse/render the server email drain uses, so the preview matches what sends). No
// Meta approval, no paramMap. Saves via POST /marketing/save-email-template.

// Built-in merge fields offered as insert chips. The drain fills these per-send;
// MERGE_FIELDS_V1 is the canonical email vocabulary (campaignRenderer).
const EMAIL_FIELDS = MERGE_FIELDS_V1.filter((f) => f !== 'unsubscribeUrl');

// Realistic preview stand-ins so the rendered preview isn't blank (cosmetic — real
// sends fill from each recipient's data).
const EMAIL_PREVIEW_SAMPLES: MergeValues = {
  firstName: 'Sara',
  lastName: 'Khan',
  listingTitle: 'Marina View 2BR',
  listingPrice: 'AED 2,400,000',
  permitNumber: 'RERA-12345',
  agentName: 'Omar Aziz',
  agentPhone: '+971 50 123 4567',
};

export const EmailTemplateModal = ({
  initial,
  customFields,
  onClose,
}: {
  initial: EmailTemplateOption | null;
  customFields: CustomFieldOption[];
  onClose: (changed: boolean) => void;
}) => {
  const notify = usePropelToast();
  const [name, setName] = useState(initial?.name ?? '');
  const [languageCode, setLanguageCode] = useState<'EN' | 'AR'>(
    initial?.languageCode === 'AR' ? 'AR' : 'EN',
  );
  const [subject, setSubject] = useState(initial?.subject ?? '');
  const [bodyText, setBodyText] = useState(initial?.bodyText ?? '');
  const [saving, setSaving] = useState(false);

  const subjectRef = useRef<HTMLInputElement | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  // Cursor-true merge-field insert: inserts at the caret of the targeted field.
  // In real twenty-front the DOM APIs (focus/setSelectionRange) work normally
  // (unlike the legacy sandbox where they were guarded), so caret restore is exact.
  const insertToken = (target: 'subject' | 'body', field: string) => {
    const token = `{{${field}}}`;
    const el = target === 'subject' ? subjectRef.current : bodyRef.current;
    const value = target === 'subject' ? subject : bodyText;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? start;
    const next = value.slice(0, start) + token + value.slice(end);
    if (target === 'subject') setSubject(next);
    else setBodyText(next);
    const caret = start + token.length;
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  };

  const rtl = languageCode === 'AR';

  // Preview samples include the REAL custom-field values (a snippet always fills
  // from its fixed workspace value — the preview shows exactly what sends).
  const previewSamples = useMemo(() => {
    const out: MergeValues = { ...EMAIL_PREVIEW_SAMPLES };
    for (const cf of customFields)
      (out as Record<string, string>)[cf.key] = cf.value;
    return out;
  }, [customFields]);

  const preview = useMemo(
    () => ({
      subj: renderParsed(parseTemplate(subject), previewSamples, {
        escape: false,
      })
        .replace(/\s+/g, ' ')
        .trim(),
      body: renderParsed(parseTemplate(bodyText), previewSamples, {
        escape: false,
      }),
    }),
    [subject, bodyText, previewSamples],
  );

  const canSave = name.trim() !== '' && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    const res = await callPropelRoute<{
      ok?: boolean;
      emailTemplateId?: string;
      error?: string;
      operatorAction?: string;
    }>('/marketing/save-email-template', {
      ...(initial ? { emailTemplateId: initial.id } : {}),
      name: name.trim(),
      subject,
      bodyText,
      languageCode,
    });
    setSaving(false);
    if (
      res === null ||
      (res.error !== undefined && res.error !== '') ||
      res.emailTemplateId === undefined
    ) {
      notify(
        res?.operatorAction || res?.error || 'Could not save the template.',
        'error',
      );
      return;
    }
    notify(initial ? 'Template updated.' : 'Template created.', 'success');
    onClose(true);
  };

  const FieldChips = ({ target }: { target: 'subject' | 'body' }) => (
    <Group gap={6} mt="xs">
      <Text size="xs" tt="uppercase" c="dimmed" ff="monospace">
        insert
      </Text>
      {EMAIL_FIELDS.map((f) => (
        <Button
          key={`${target}-${f}`}
          size="compact-xs"
          variant="light"
          color="blue"
          ff="monospace"
          onClick={() => insertToken(target, f)}
        >{`{{${f}}}`}</Button>
      ))}
      {customFields.map((cf) => (
        <Button
          key={`${target}-cf-${cf.id}`}
          size="compact-xs"
          variant="light"
          color="red"
          ff="monospace"
          title={cf.label || cf.value}
          onClick={() => insertToken(target, cf.key)}
        >{`{{${cf.key}}}`}</Button>
      ))}
    </Group>
  );

  return (
    <Modal
      opened
      onClose={() => onClose(false)}
      title={initial ? 'Edit email template' : 'New email template'}
      size="lg"
      zIndex={5000}
    >
      <Stack gap="md">
        <TextInput
          label="Template name"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          placeholder="Listing launch — EN"
        />

        <Box>
          <Text size="sm" fw={600} mb={4}>
            Language
          </Text>
          <SegmentedControl
            value={languageCode}
            onChange={(v) => setLanguageCode(v as 'EN' | 'AR')}
            data={[
              { label: 'EN', value: 'EN' },
              { label: 'AR', value: 'AR' },
            ]}
          />
        </Box>

        <Box>
          <TextInput
            label="Subject"
            ref={subjectRef}
            dir={rtl ? 'rtl' : 'ltr'}
            value={subject}
            onChange={(e) => setSubject(e.currentTarget.value)}
            placeholder="Subject line"
          />
          <FieldChips target="subject" />
        </Box>

        <Box>
          <Textarea
            label="Body"
            ref={bodyRef}
            dir={rtl ? 'rtl' : 'ltr'}
            value={bodyText}
            onChange={(e) => setBodyText(e.currentTarget.value)}
            placeholder="Write your message…"
            autosize
            minRows={8}
          />
          <FieldChips target="body" />
        </Box>

        {subject !== '' || bodyText !== '' ? (
          <Box
            style={{
              border: '1px solid var(--mantine-color-default-border)',
              borderRadius: 8,
              padding: 14,
              direction: rtl ? 'rtl' : 'ltr',
            }}
          >
            <Text size="xs" tt="uppercase" c="dimmed" fw={700} mb={6}>
              Preview
            </Text>
            {preview.subj !== '' ? (
              <Text fw={700} size="sm" mb={8}>
                {preview.subj}
              </Text>
            ) : null}
            <Text
              size="sm"
              c="dimmed"
              style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55 }}
            >
              {preview.body}
            </Text>
          </Box>
        ) : null}

        <Group justify="space-between" mt="sm">
          <Button variant="default" onClick={() => onClose(false)} disabled={saving}>
            Cancel
          </Button>
          <Button color="red" onClick={() => void save()} loading={saving} disabled={!canSave}>
            {initial ? 'Save template' : 'Create template'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
