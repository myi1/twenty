/* eslint-disable @nx/enforce-module-boundaries */
/* oxlint-disable twenty/no-hardcoded-colors -- this file builds EMAIL content
   (MJML strings) + GrapesJS block-tile SVG icons, where colors MUST be literal
   hex: email clients can't read CSS theme variables, and the brand header uses
   fixed RE/MAX brand colors. The Mantine CHROME around the editor uses theme
   tokens; only the email-payload/icon literals are exempted here. */
// ─────────────────────────────────────────────────────────────────────────────
// GrapesJS + MJML email editor — the HEAVY inner component
// ─────────────────────────────────────────────────────────────────────────────
//
// THIS is the module that imports grapesjs / grapesjs-mjml / @grapesjs/react
// (~3.5 MB). It is loaded ONLY via React.lazy() from GrapesEmailBuilder, so the
// grapesjs library is not EVALUATED until the user actually opens the designer.
// (Note: heroes build as a single inlined index.js — see GrapesEmailBuilder for
// why this defers evaluation, not network download.)
//
// The ONE email editor everywhere (founder direction, TM#50): both the
// campaign-builder hero and the marketing-hub Templates tab mount this via the
// shared GrapesEmailBuilder wrapper. Drag MJML blocks, drop a branded RE/MAX
// header, insert merge tags ({{firstName}} …), live-preview, EXPORT cross-client
// HTML, and (in template mode, or via "Save as template" in campaign mode) SAVE
// the design to the reusable email-template library.
//
// Libraries (founder-sanctioned GrapesJS adoption):
//   • grapesjs           0.23.2  — web-builder framework + default UI
//   • grapesjs-mjml      1.0.8   — MJML blocks + live mjml→HTML compilation
//   • @grapesjs/react    2.0.0   — thin React wrapper (<GjsEditor>)
//
// API confirmed via Context7:
//   - <GjsEditor grapesjs={grapesjs} options={…} onEditor={cb}/> forwards
//     `options` into grapesjs.init, so MJML rides options.plugins.
//   - editor.Commands.run('mjml-code-to-html') → { html, errors }   (export)
//   - editor.Commands.run('export-template')    → dual MJML+HTML modal (preview)
//   - editor.BlockManager.add(id, { label, content, category, media })

import grapesjs, { type Editor } from 'grapesjs';
import grapesjsMjml from 'grapesjs-mjml';
import GjsEditor from '@grapesjs/react';
import { useCallback, useRef, useState } from 'react';
import {
  Anchor,
  Badge,
  Box,
  Button,
  Code,
  CopyButton,
  Group,
  Menu,
  Modal,
  ScrollArea,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import {
  IconCode,
  IconBuildingSkyscraper,
  IconChevronDown,
  IconCopy,
  IconCheck,
  IconDeviceFloppy,
  IconTag,
} from 'twenty-ui/display';
import { usePropelToast } from '@/propel/hooks/usePropelToast';
import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import {
  type GrapesEmailEditorProps,
  type GrapesEmailTemplateSeed,
} from './grapesEmailTypes';

import 'grapesjs/dist/css/grapes.min.css';

// Wrap grapesjs-mjml so its options apply deterministically. GrapesJS resolves
// `pluginsOpts[id]` by a plugin id derived from the function (not the function
// object used as a key), so keying pluginsOpts by the imported function is
// brittle. Calling the plugin ourselves with an explicit opts object is the
// reliable way to pass MJML options. The wrapper IS the plugin we register.
const mjmlPlugin = (editor: Editor) =>
  grapesjsMjml(editor, {
    // Keep the plugin's default MJML block set (we add Propel blocks on top).
    resetBlocks: false,
    // A sensible placeholder so a freshly-dropped mj-image isn't a blank box.
    imagePlaceholderSrc:
      'https://via.placeholder.com/600x300/eeeeee/999999?text=Image',
  });

// ── Brand kit (INTERIM logo + colors) ────────────────────────────────────────
// The logo is the REAL RE/MAX Hub brand asset, served from the founder's own site
// (https://www.remaxhub.ae/assets/Remax_logo.jpeg — 200 image/jpeg, hotlink-safe
// since it's their domain). It replaces the previous broken sample URL (a wikimedia
// SVG that 404'd → the broken-image icon the founder saw).
//
// TODO(real wiring): pull logo + colors from the brand-kit backend rather than
// hardcoding. The fork has NO direct brand-kit READ in the front-end — the social
// "branded card" affordance (lib/socialBrandCard.ts) instead posts to the SERVER
// route `/marketing/social/brand-card`, which resolves branding server-side and
// composites an image via the image-service. To expose logo/colors to this editor,
// add a small `brandKit:{logoUrl,colorPrimary,colorAccent}` block to the
// marketing-hub route payload and thread it in as a prop (app-side, app:install).
const BRAND = {
  name: 'RE/MAX Hub',
  logoUrl: 'https://www.remaxhub.ae/assets/Remax_logo.jpeg',
  primary: '#003DA5', // RE/MAX blue   (real wiring → brandKit.colorPrimary)
  accent: '#DC1C2E', // RE/MAX red    (real wiring → brandKit.colorAccent)
  footerText: 'RE/MAX Hub · Dubai, UAE · {{agentName}}',
} as const;

// ── Merge tags offered in the toolbar ────────────────────────────────────────
// MUST be a subset of the email send-drain's DRAIN_POPULATED_FIELDS (the app's
// marketing-save-email-template-route rejects any other {{token}}), so a template
// saved from here passes server validation. firstName / agentName / listingTitle
// are all drain-populatable. Custom fields passed via props are appended so the
// menu offers the workspace's saved snippets too.
const BUILTIN_MERGE_TAGS: { token: string; label: string }[] = [
  { token: '{{firstName}}', label: 'First name' },
  { token: '{{agentName}}', label: 'Agent name' },
  { token: '{{listingTitle}}', label: 'Listing title' },
];

// The drag-in branded header block — a self-contained MJML section using the
// brand kit. Dropping it onto the canvas inserts a real, on-brand header.
const BRANDED_HEADER_MJML = `<mj-section background-color="${BRAND.primary}" padding="20px 16px">
  <mj-column>
    <mj-image width="150px" src="${BRAND.logoUrl}" alt="${BRAND.name}" />
    <mj-text align="center" color="#ffffff" font-size="13px" letter-spacing="1px" padding-top="8px">
      ${BRAND.name.toUpperCase()}
    </mj-text>
  </mj-column>
</mj-section>`;

// The MJML the canvas opens with when there's no saved design to restore.
const STARTER_MJML = `<mjml>
  <mj-body background-color="#f4f5f7">
    <mj-section background-color="${BRAND.primary}" padding="16px">
      <mj-column>
        <mj-image width="140px" src="${BRAND.logoUrl}" alt="${BRAND.name}" />
      </mj-column>
    </mj-section>
    <mj-section background-color="#ffffff" padding="24px">
      <mj-column>
        <mj-text font-size="22px" font-weight="700" color="#111827">
          Hi {{firstName}},
        </mj-text>
        <mj-text font-size="15px" line-height="1.6" color="#374151">
          Drag a block from the left, drop the <strong>Branded header</strong>,
          insert a merge tag from the toolbar, then save it as a template.
        </mj-text>
        <mj-button background-color="${BRAND.accent}" href="#" font-weight="600">
          View the listing
        </mj-button>
      </mj-column>
    </mj-section>
    <mj-section padding="12px">
      <mj-column>
        <mj-text align="center" font-size="12px" color="#9ca3af">
          ${BRAND.footerText}
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;

// Compile the current canvas → cross-client HTML (the plugin's command returns
// { html, errors }). Shared by Export + Save-as-template.
const compileHtml = (editor: Editor): { html: string; errors: string[] } => {
  const res = editor.Commands.run('mjml-code-to-html') as {
    html?: string;
    errors?: { message?: string; formattedMessage?: string }[];
  };
  return {
    html: res?.html ?? '',
    errors: (res?.errors ?? []).map(
      (e) => e.formattedMessage ?? e.message ?? 'Unknown MJML warning',
    ),
  };
};

export const GrapesEmailEditor = ({
  mode,
  initial,
  customFields = [],
  onSaved,
  onClose,
}: GrapesEmailEditorProps) => {
  const notify = usePropelToast();
  // The live GrapesJS Editor instance — an imperative handle to a 3rd-party
  // object, NOT React state (we never render from it; callbacks read it). Same
  // pattern PostComposer uses for its imperative refs.
  // oxlint-disable-next-line twenty/no-state-useref
  const editorRef = useRef<Editor | null>(null);

  const [exportOpen, setExportOpen] = useState(false);
  const [exportHtml, setExportHtml] = useState('');
  const [exportErrors, setExportErrors] = useState<string[]>([]);

  // Save-as-template state. In 'template' mode the editor IS a template editor,
  // so the name/subject seed from the template being edited; in 'campaign' mode
  // the "Save as template" action opens this modal blank.
  const [saveOpen, setSaveOpen] = useState(false);
  const [tplName, setTplName] = useState(initial?.name ?? '');
  const [tplSubject, setTplSubject] = useState(initial?.subject ?? '');
  const [saving, setSaving] = useState(false);

  // Merge-tag menu = built-ins + the workspace custom fields (saved snippets).
  const mergeTags = [
    ...BUILTIN_MERGE_TAGS,
    ...customFields.map((cf) => ({
      token: `{{${cf.key}}}`,
      label: cf.label || cf.key,
    })),
  ];

  // Register the Propel blocks + seed the canvas once the editor mounts. If an
  // initial design is provided we restore it; otherwise the starter skeleton.
  const onEditor = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;

      // Branded header — a drag-in block in its own "Propel" category.
      editor.BlockManager.add('propel-branded-header', {
        label: 'Branded header',
        category: 'Propel',
        media: `<svg viewBox="0 0 24 24" width="22" height="22" fill="${BRAND.accent}"><path d="M3 5h18v6H3z"/><rect x="3" y="13" width="12" height="2" fill="#9ca3af"/></svg>`,
        content: BRANDED_HEADER_MJML,
      });

      // Merge-tag block — the drag-first alternative to the toolbar menu.
      editor.BlockManager.add('propel-merge-tag', {
        label: 'Merge tag',
        category: 'Propel',
        media: `<svg viewBox="0 0 24 24" width="22" height="22" fill="${BRAND.primary}"><path d="M5 5h9l5 5v9H5z"/><text x="8" y="16" font-size="7" fill="#fff">{ }</text></svg>`,
        content: `<mj-text font-size="15px" color="#374151">Hi {{firstName}}, …</mj-text>`,
      });

      // Restore a saved GrapesJS design if we have one, else the starter. The
      // project JSON (re-editable) is preferred; bodyMjml is a forward-compat
      // hook; otherwise the starter skeleton. (Today templates only persist HTML
      // in bodyText — see GrapesEmailBuilder's note — so re-open starts fresh.)
      const seed = initial?.designProjectJson;
      if (seed) {
        try {
          editor.loadProjectData(JSON.parse(seed));
        } catch {
          editor.setComponents(STARTER_MJML);
        }
      } else {
        editor.setComponents(STARTER_MJML);
      }
    },
    [initial],
  );

  // Insert a merge tag into the selected text component (or a new text block).
  const insertMergeTag = useCallback((token: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    const selected = editor.getSelected();
    if (selected && selected.is('mj-text')) {
      selected.append(` ${token}`);
    } else {
      editor.addComponents(
        `<mj-text font-size="15px" color="#374151">${token}</mj-text>`,
      );
    }
  }, []);

  // EXPORT — show the real compiled cross-client HTML.
  const exportProductionHtml = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const { html, errors } = compileHtml(editor);
    setExportHtml(html);
    setExportErrors(errors);
    setExportOpen(true);
  }, []);

  // Native dual MJML+HTML modal (a second way to eyeball the compiled output).
  const openNativePreview = useCallback(() => {
    editorRef.current?.Commands.run('export-template');
  }, []);

  // SAVE AS TEMPLATE — compile the design to HTML and persist via the existing
  // marketing-save-email-template-route. We store the exported HTML in the
  // template's `bodyText` field (it's a TEXT field; HTML is text), so the saved
  // template is immediately reusable by a campaign.
  //
  // KNOWN LIMITATION (flagged, not silently dropped): the marketingEmailTemplate
  // object has NO field for the GrapesJS project JSON, and adding one requires an
  // app:install schema change (out of scope: STAGING-only, no app:install). So a
  // saved template round-trips its HTML, but re-opening it in GrapesJS starts from
  // the starter skeleton rather than the exact node graph. The re-editable path
  // needs a `designProjectJson` RAW_JSON field on the object (a gated deploy).
  const doSaveTemplate = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor || saving) return;
    if (tplName.trim() === '') {
      notify('Give the template a name first.', 'error');
      return;
    }
    const { html, errors } = compileHtml(editor);
    if (errors.length > 0) {
      // Compile warnings are non-fatal (MJML still emits HTML), but surface them.
      notify(`Saved with MJML warnings: ${errors[0]}`, 'info');
    }
    setSaving(true);
    const res = await callPropelRoute<{
      ok?: boolean;
      emailTemplateId?: string;
      error?: string;
      operatorAction?: string;
    }>('/marketing/save-email-template', {
      ...(initial?.id ? { emailTemplateId: initial.id } : {}),
      name: tplName.trim(),
      subject: tplSubject,
      // The compiled cross-client HTML becomes the template body. Merge tokens
      // stay as {{token}} for the send-time personalizer.
      bodyText: html,
      languageCode: initial?.languageCode ?? 'EN',
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
    notify(initial?.id ? 'Template updated.' : 'Template saved.', 'success');
    setSaveOpen(false);
    onSaved?.(res.emailTemplateId);
  }, [saving, tplName, tplSubject, initial, notify, onSaved]);

  const isTemplateMode = mode === 'template';

  return (
    <Stack gap="xs" style={{ flex: 1, minHeight: 0 }}>
      {/* Toolbar — merge tags + export + save, themed to roughly match Pulse. */}
      <Group justify="space-between" wrap="nowrap">
        <Group gap="xs" wrap="nowrap">
          <Badge
            size="sm"
            variant="light"
            color="red"
            leftSection={<IconBuildingSkyscraper size={12} />}
          >
            GrapesJS · MJML
          </Badge>
          <Menu shadow="md" width={220} position="bottom-start">
            <Menu.Target>
              <Button
                size="compact-sm"
                variant="default"
                leftSection={<IconTag size={14} />}
                rightSection={<IconChevronDown size={14} />}
              >
                Insert merge tag
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>Personalization</Menu.Label>
              {mergeTags.map((t) => (
                <Menu.Item
                  key={t.token}
                  onClick={() => insertMergeTag(t.token)}
                  rightSection={<Code style={{ fontSize: 11 }}>{t.token}</Code>}
                >
                  {t.label}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        </Group>
        <Group gap="xs" wrap="nowrap">
          {onClose && (
            <Button
              size="compact-sm"
              variant="subtle"
              color="gray"
              onClick={onClose}
            >
              Close
            </Button>
          )}
          <Button
            size="compact-sm"
            variant="subtle"
            color="gray"
            leftSection={<IconCode size={14} />}
            onClick={openNativePreview}
          >
            MJML view
          </Button>
          <Button
            size="compact-sm"
            variant="default"
            leftSection={<IconCode size={14} />}
            onClick={exportProductionHtml}
          >
            Export HTML
          </Button>
          <Button
            size="compact-sm"
            color="red"
            leftSection={<IconDeviceFloppy size={14} />}
            onClick={() => {
              // Seed the modal name/subject when opening (template mode keeps the
              // existing values; campaign mode starts blank unless prefilled).
              setSaveOpen(true);
            }}
          >
            {isTemplateMode ? 'Save template' : 'Save as template'}
          </Button>
        </Group>
      </Group>

      {/* The GrapesJS editor — default UI. grapesjs-mjml swaps the block panel,
          style manager and devices for MJML-aware ones. */}
      <Box
        style={{
          flex: 1,
          minHeight: 480,
          border: '1px solid var(--mantine-color-default-border)',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        <GjsEditor
          grapesjs={grapesjs}
          onEditor={onEditor}
          options={{
            height: '100%',
            storageManager: false,
            fromElement: false,
            plugins: [mjmlPlugin],
          }}
        />
      </Box>

      {/* Save-as-template modal — name + optional subject. */}
      <Modal
        opened={saveOpen}
        onClose={() => setSaveOpen(false)}
        title={initial?.id ? 'Update email template' : 'Save as email template'}
        size="md"
        zIndex={6000}
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Saves the current design as a reusable email template. The compiled
            cross-client HTML becomes the template body; merge tags stay as
            tokens for the send-time personalizer.
          </Text>
          <TextInput
            label="Template name"
            value={tplName}
            onChange={(e) => setTplName(e.currentTarget.value)}
            placeholder="Listing launch — EN"
            data-autofocus
          />
          <TextInput
            label="Subject (optional)"
            value={tplSubject}
            onChange={(e) => setTplSubject(e.currentTarget.value)}
            placeholder="A new listing you'll love"
          />
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => setSaveOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              color="red"
              leftSection={<IconDeviceFloppy size={14} />}
              loading={saving}
              onClick={() => void doSaveTemplate()}
            >
              {initial?.id ? 'Update template' : 'Save template'}
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Export result — the REAL compiled cross-client HTML. */}
      <Modal
        opened={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Exported email HTML (cross-client)"
        size="xl"
        zIndex={6000}
      >
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            The real MJML-compiled, email-client-safe HTML. Merge tags like{' '}
            <Code>{'{{firstName}}'}</Code> stay as tokens for the send-time
            personalizer to fill.
          </Text>
          {exportErrors.length > 0 && (
            <Stack gap={2}>
              {exportErrors.map((e, i) => (
                <Text key={i} size="xs" c="orange">
                  MJML warning: {e}
                </Text>
              ))}
            </Stack>
          )}
          <Group justify="flex-end">
            <CopyButton value={exportHtml}>
              {({ copied, copy }) => (
                <Button
                  size="compact-sm"
                  variant="light"
                  color={copied ? 'teal' : 'red'}
                  leftSection={
                    copied ? <IconCheck size={14} /> : <IconCopy size={14} />
                  }
                  onClick={copy}
                >
                  {copied ? 'Copied' : 'Copy HTML'}
                </Button>
              )}
            </CopyButton>
          </Group>
          <ScrollArea h={360} type="auto">
            <Code
              block
              style={{
                fontSize: 11,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}
            >
              {exportHtml || '(empty — add some content first)'}
            </Code>
          </ScrollArea>
          <Text size="xs" c="dimmed">
            Brand logo + colors are interim (real RE/MAX Hub logo, hardcoded
            colors). Production pulls them from the brand-kit backend.{' '}
            <Anchor
              href="https://github.com/grapesjs/mjml"
              target="_blank"
              size="xs"
            >
              grapesjs-mjml
            </Anchor>
          </Text>
        </Stack>
      </Modal>
    </Stack>
  );
};

export type { GrapesEmailEditorProps, GrapesEmailTemplateSeed };
export default GrapesEmailEditor;
