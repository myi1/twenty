import {
  Alert,
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
import { useEffect, useMemo, useState } from 'react';
import { usePropelToast } from '@/propel/hooks/usePropelToast';
import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import { type WaTemplateOption } from '@/propel/types/marketingHome';

// Mantine modal rebuild of the legacy WhatsApp TemplateEditorSheet
// (marketing-cloud-tpleditors.tsx). WhatsApp templates are pre-approved by Meta:
// the editor captures the EXACT body Meta reviews plus the positional {{1..n}} →
// merge-field binding (paramMap, APPEND-ONLY — the click order IS the {{n}} order).
// "Save draft" persists via POST /marketing/save-template; "Submit to Meta" sends
// the typed create-input to POST /marketing/wa-template-create.
//
// PARITY NOTE: the legacy editor mirrored the FULL Meta create-input validation
// client-side (wa-template-create.validateCreateInput) + header/footer/buttons
// component assembly + the drain-aware placeholder renderer (wa-template-renderer).
// Those libs are NOT ported into twenty-front here; this rebuild keeps the
// essential client gates (Meta name format + a strict numbered-placeholder
// sequence check that matches the save-template route) and a STATIC TEXT header +
// footer, and relies on the wa-template-create route as the authoritative Meta
// validator — surfacing its error/operatorAction verbatim. Submitting buttons /
// media headers and the inline "X things to fix" mirror are the remaining parity
// gap (see the TODO at the bottom). The body→paramMap binding, bodyExample, and
// save are full-fidelity.

// The merge fields the drain can populate for a WhatsApp positional param — the
// exact DRAIN_POPULATED_FIELDS set the save route gates against.
const WA_BINDING_FIELDS = [
  'firstName',
  'lastName',
  'fullName',
  'email',
  'phone',
  'listingTitle',
  'permitNumber',
  'agentName',
  'agentPhone',
  'agentEmail',
  'officeName',
];

const TPL_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'REJECTED',
  'PAUSED',
] as const;
const META_NAME_RE = /^[a-z0-9_]+$/;
const REVIEWED_STATES = new Set(['SUBMITTED', 'APPROVED']);
const SUBMIT_LOCALE: Record<'EN' | 'AR', string> = { EN: 'en_US', AR: 'ar' };

const titleCase = (s: string): string =>
  s ? s.charAt(0) + s.slice(1).toLowerCase() : s;

// Distinct numbered placeholders the body uses (e.g. {{1}}, {{2}}…). Reuse counts
// once. Mirrors the count side of the route's bodyPlaceholdersValid contract.
const distinctBodyParams = (body: string): number[] => {
  const nums = new Set<number>();
  for (const m of body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) {
    nums.add(Number(m[1]));
  }
  return [...nums].sort((a, b) => a - b);
};

// A non-numeric placeholder ({{name}}) is invalid for WhatsApp.
const hasNonNumericPlaceholder = (body: string): boolean =>
  /\{\{\s*[a-zA-Z_]/.test(body);

// The body's distinct {{n}} must be exactly {1..N} where N = paramMap.length
// (numbered in range, no gaps) — the same contract the save-template route enforces.
const placeholdersValid = (body: string, paramCount: number): boolean => {
  if (hasNonNumericPlaceholder(body)) return false;
  const nums = distinctBodyParams(body);
  if (nums.length !== paramCount) return false;
  for (let i = 0; i < paramCount; i += 1) {
    if (nums[i] !== i + 1) return false;
  }
  return true;
};

export const WaTemplateModal = ({
  initial,
  onClose,
}: {
  initial: WaTemplateOption | null;
  onClose: (changed: boolean) => void;
}) => {
  const notify = usePropelToast();
  const [name, setName] = useState(initial?.name ?? '');
  const [languageCode, setLanguageCode] = useState<'EN' | 'AR'>(
    initial?.languageCode ?? 'EN',
  );
  const [category, setCategory] = useState<'MARKETING' | 'UTILITY'>(
    initial?.category === 'UTILITY' ? 'UTILITY' : 'MARKETING',
  );
  const [bodyText, setBodyText] = useState(initial?.bodyText ?? '');
  const [paramMap, setParamMap] = useState<string[]>(initial?.paramMap ?? []);
  const [bodyExample, setBodyExample] = useState<string[]>(
    initial?.bodyExample ?? [],
  );
  const [status, setStatus] = useState<string>(initial?.status ?? 'DRAFT');
  const [headerText, setHeaderText] = useState('');
  const [footer, setFooter] = useState('');
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<{ id: string } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Append-only binding: the chip adds {{n}} at the end and pushes its field.
  const appendParam = (key: string) => {
    setBodyText((b) => `${b}${b && !b.endsWith(' ') ? ' ' : ''}{{${paramMap.length + 1}}}`);
    setParamMap((m) => [...m, key]);
  };
  const clearParams = () => {
    setBodyText((b) => b.replace(/\s?\{\{\s*\d+\s*\}\}/g, ''));
    setParamMap([]);
  };

  const rtl = languageCode === 'AR';
  const nameOk = META_NAME_RE.test(name.trim());
  const badPlaceholder = useMemo(
    () => hasNonNumericPlaceholder(bodyText),
    [bodyText],
  );
  const seqOk = useMemo(
    () => placeholdersValid(bodyText, paramMap.length),
    [bodyText, paramMap.length],
  );
  const bodyParamCount = useMemo(
    () => distinctBodyParams(bodyText).length,
    [bodyText],
  );

  // Editing a reviewed template: any Meta-reviewed field changing invalidates the
  // prior verdict, so a reviewed status must drop to DRAFT.
  const reviewedDirty =
    initial !== null &&
    (name.trim() !== initial.name ||
      languageCode !== initial.languageCode ||
      category !== (initial.category === 'UTILITY' ? 'UTILITY' : 'MARKETING') ||
      bodyText !== initial.bodyText ||
      JSON.stringify(paramMap) !== JSON.stringify(initial.paramMap ?? []));
  useEffect(() => {
    if (reviewedDirty && REVIEWED_STATES.has(status)) setStatus('DRAFT');
  }, [reviewedDirty, status]);

  const canSave =
    name.trim() !== '' &&
    nameOk &&
    seqOk &&
    !(reviewedDirty && REVIEWED_STATES.has(status)) &&
    !saving;

  // A template managed in Meta (has a Meta id OR status !== DRAFT) is not
  // resubmittable from here — mirrors the server's editTemplateId gate.
  const alreadyInMeta = Boolean(
    initial && (initial.metaTemplateId || (initial.status && initial.status !== 'DRAFT')),
  );

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    const res = await callPropelRoute<{
      ok?: boolean;
      templateId?: string;
      error?: string;
      operatorAction?: string;
    }>('/marketing/save-template', {
      ...(initial ? { templateId: initial.id } : {}),
      name: name.trim(),
      languageCode,
      category,
      bodyText,
      paramMap,
      bodyExample: bodyExample.slice(0, bodyParamCount),
      status,
    });
    setSaving(false);
    if (
      res === null ||
      (res.error !== undefined && res.error !== '') ||
      res.templateId === undefined
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

  // Submit the typed create-input to Meta. The route is the authoritative Meta
  // validator; on ENV_MISSING (e.g. staging without WABA creds) it returns a typed
  // envelope we surface as a toast. Server gates name/body/example/buttons.
  const canSubmit =
    name.trim() !== '' &&
    nameOk &&
    seqOk &&
    bodyText.trim() !== '' &&
    !submitting &&
    submitted === null &&
    !saving &&
    !alreadyInMeta;

  const submitToMeta = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    const res = await callPropelRoute<{
      ok?: boolean;
      id?: string;
      status?: string;
      error?: string;
      code?: string;
      operatorAction?: string;
      warning?: string;
    }>('/marketing/wa-template-create', {
      ...(initial ? { templateId: initial.id } : {}),
      name: name.trim(),
      languageCode,
      language: SUBMIT_LOCALE[languageCode],
      category,
      bodyText,
      bodyExample: bodyExample.slice(0, bodyParamCount),
      paramMap,
      header:
        headerText.trim() !== ''
          ? { format: 'TEXT', text: headerText.trim() }
          : undefined,
      footer: footer.trim() !== '' ? footer.trim() : undefined,
      buttons: [],
    });
    setSubmitting(false);
    if (res === null || res.error !== undefined || res.id === undefined) {
      const msg =
        res?.code === 'ENV_MISSING'
          ? res.error || "WhatsApp isn't configured on this environment."
          : res?.error || 'Could not submit the template to Meta.';
      setSubmitError(res?.code === 'ENV_MISSING' ? null : msg);
      notify(res?.code === 'ENV_MISSING' ? msg : res?.operatorAction || msg, 'error');
      return;
    }
    setSubmitted({ id: res.id });
    if (res.warning !== undefined && res.warning !== '') notify(res.warning, 'info');
    notify('Submitted to Meta — pending approval.', 'success');
  };

  return (
    <Modal
      opened
      onClose={() => (submitted ? onClose(true) : onClose(false))}
      title={initial ? 'Edit template' : 'New WhatsApp template'}
      size="lg"
      zIndex={5000}
    >
      <Stack gap="md">
        <TextInput
          label="Template name"
          description="Meta format — lowercase letters, digits and underscores."
          value={name}
          onChange={(e) =>
            setName(e.currentTarget.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))
          }
          placeholder="listing_launch_en"
          styles={{ input: { fontFamily: 'monospace' } }}
          error={name.trim() !== '' && !nameOk ? 'Invalid name format' : undefined}
        />

        <Group gap="xl" wrap="wrap">
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
            <Text size="sm" fw={600} mb={4}>
              Category
            </Text>
            <SegmentedControl
              value={category}
              onChange={(v) => setCategory(v as 'MARKETING' | 'UTILITY')}
              data={[
                { label: 'Marketing', value: 'MARKETING' },
                { label: 'Utility', value: 'UTILITY' },
              ]}
            />
          </Box>
        </Group>

        <Box>
          <Textarea
            label="Body — exactly as submitted to Meta"
            dir={rtl ? 'rtl' : 'ltr'}
            value={bodyText}
            onChange={(e) => setBodyText(e.currentTarget.value)}
            placeholder={'Hi {{1}}, {{2}} is now live. Reply STOP to opt out.'}
            autosize
            minRows={5}
          />
          <Group gap={6} mt="xs">
            <Text size="xs" tt="uppercase" c="dimmed" ff="monospace">
              add field
            </Text>
            {WA_BINDING_FIELDS.map((f) => (
              <Button
                key={f}
                size="compact-xs"
                variant="light"
                color="blue"
                ff="monospace"
                onClick={() => appendParam(f)}
                title={`Append {{${paramMap.length + 1}}} bound to ${f}`}
              >
                + {f}
              </Button>
            ))}
            {paramMap.length > 0 ? (
              <Button
                size="compact-xs"
                variant="default"
                onClick={clearParams}
                title="Remove all {{n}} placeholders and bindings"
              >
                clear fields
              </Button>
            ) : null}
          </Group>
          {paramMap.length > 0 ? (
            <Text size="xs" c="dimmed" ff="monospace" mt={6}>
              {paramMap.map((k, i) => `{{${i + 1}}} ← ${k}`).join('  ·  ')}
            </Text>
          ) : null}
          {badPlaceholder ? (
            <Text size="xs" c="red" mt={6}>
              WhatsApp uses numbered placeholders only — {'{{1}}'}, {'{{2}}'}…
              Remove any {'{{name}}'}-style tokens from the body.
            </Text>
          ) : !seqOk ? (
            <Text size="xs" c="red" mt={6}>
              {paramMap.length === 0
                ? 'Remove the {{n}} placeholders from the body, or add fields to bind them.'
                : `Every bound field must appear as {{1}}…{{${paramMap.length}}} — numbered in range, no gaps.`}
            </Text>
          ) : null}
        </Box>

        {/* Sample values — Meta needs one per {{n}} to review */}
        {bodyParamCount > 0 && !badPlaceholder ? (
          <Box>
            <Text size="sm" fw={600} mb={6}>
              {`Sample values — for Meta’s review of {{1}}…{{${bodyParamCount}}}`}
            </Text>
            <Stack gap={8}>
              {Array.from({ length: bodyParamCount }, (_, i) => (
                <Group key={i} gap={8} wrap="nowrap">
                  <Text ff="monospace" size="sm" c="blue" w={38}>
                    {`{{${i + 1}}}`}
                  </Text>
                  <TextInput
                    style={{ flex: 1 }}
                    value={bodyExample[i] ?? ''}
                    onChange={(e) => {
                      const next = [...bodyExample];
                      next[i] = e.currentTarget.value;
                      setBodyExample(next);
                    }}
                    placeholder={i === 0 ? 'Sara' : 'Marina View 2BR'}
                  />
                </Group>
              ))}
            </Stack>
            <Text size="xs" c="dimmed" mt={5}>
              Examples only — real sends fill from each recipient’s data.
            </Text>
          </Box>
        ) : null}

        <TextInput
          label="Header (optional, static text)"
          value={headerText}
          onChange={(e) => setHeaderText(e.currentTarget.value)}
          placeholder="A short header line"
          maxLength={60}
        />
        <TextInput
          label="Footer (optional)"
          value={footer}
          onChange={(e) => setFooter(e.currentTarget.value)}
          placeholder="Use the buttons below to opt out"
          maxLength={60}
        />

        <Box>
          <Text size="sm" fw={600} mb={6}>
            Status — mirrors Meta’s review; refresh with “Sync from Meta”
          </Text>
          <Group gap={6}>
            {TPL_STATUSES.map((s) => {
              const lockReviewed = REVIEWED_STATES.has(s) && reviewedDirty;
              return (
                <Button
                  key={s}
                  size="compact-xs"
                  variant={status === s ? 'filled' : 'default'}
                  color={status === s ? 'red' : undefined}
                  disabled={lockReviewed}
                  onClick={() => !lockReviewed && setStatus(s)}
                >
                  {titleCase(s)}
                </Button>
              );
            })}
          </Group>
          {initial?.rejectionReason ? (
            <Text size="xs" c="dimmed" mt={6}>
              Meta’s rejection reason: {initial.rejectionReason}
            </Text>
          ) : null}
        </Box>

        {submitted ? (
          <Alert color="yellow" title="Submitted — pending Meta approval">
            Meta is reviewing this template (id {submitted.id}). It can’t send until
            APPROVED — the next template sync will update its status here.
          </Alert>
        ) : submitError ? (
          <Alert color="red" title="Meta rejected the template">
            {submitError}
          </Alert>
        ) : null}

        {/* Footer actions */}
        {submitted ? (
          <Group justify="flex-end">
            <Button color="red" onClick={() => onClose(true)}>
              Done
            </Button>
          </Group>
        ) : (
          <Group justify="space-between">
            <Button
              variant="default"
              onClick={() => onClose(false)}
              disabled={saving || submitting}
            >
              Cancel
            </Button>
            <Group gap="sm">
              <Button
                variant="light"
                color="red"
                onClick={() => void save()}
                loading={saving}
                disabled={!canSave || submitting}
              >
                Save draft
              </Button>
              {alreadyInMeta ? (
                <Text size="xs" c="dimmed">
                  Managed in Meta
                </Text>
              ) : (
                <Button
                  color="red"
                  onClick={() => void submitToMeta()}
                  loading={submitting}
                  disabled={!canSubmit}
                >
                  Submit to Meta
                </Button>
              )}
            </Group>
          </Group>
        )}
      </Stack>
    </Modal>
  );
};

// TODO(wa-template-submit-parity): port the legacy client-side Meta validation
// mirror (wa-template-create.validateCreateInput → the inline "N things to fix"
// callout) + the full component editor (media/variable headers, QUICK_REPLY / URL
// / PHONE_NUMBER buttons with their per-type limits) + the drain-aware preview
// (wa-template-renderer.previewTemplateBody). This rebuild relies on the
// wa-template-create ROUTE as the authoritative validator and ships a static text
// header + footer only. See propel-crm-integration src/shared/
// marketing-cloud-tpleditors.tsx + wa-template-create.ts + wa-template-renderer.ts.
