/* eslint-disable @nx/enforce-module-boundaries */
// ─────────────────────────────────────────────────────────────────────────────
// SPIKE — GrapesJS + MJML drag-and-drop email builder
// ─────────────────────────────────────────────────────────────────────────────
//
// A real, clickable GrapesJS editor embedded in the Campaign Builder's COMPOSE
// area. It proves the "feel + capability" of adopting GrapesJS for Propel's email
// authoring: drag MJML blocks onto an email canvas, drop a branded RE/MAX header,
// insert merge tags ({{firstName}} …), live-preview, and EXPORT cross-client HTML.
//
// Libraries (all sanctioned, founder-approved adoption of GrapesJS):
//   • grapesjs           0.23.2  — the web-builder framework + default UI
//   • grapesjs-mjml      1.0.8   — MJML blocks + live mjml→HTML compilation
//   • @grapesjs/react    2.0.0   — thin React wrapper (<GjsEditor>)
//
// API confirmed via Context7 (2026-06-19):
//   - <GjsEditor grapesjs={grapesjs} grapesjsCss=… options={…} onEditor={cb}/>
//     forwards `options` straight to grapesjs.init, so MJML rides options.plugins.
//   - editor.Commands.run('mjml-code-to-html')  →  { html, errors }   (export)
//   - editor.Commands.run('export-template')     →  dual MJML+HTML modal (preview)
//   - editor.BlockManager.add(id, { label, content, category, media })
//
// SPIKE SCOPE: this is the authoring SURFACE. It is intentionally NOT wired into
// save-campaign / send (the real wizard owns that). "Export HTML" returns the
// real compiled email so the founder can see the payload a production wire-up
// would persist + send.

import grapesjs, { type Editor } from 'grapesjs';
import grapesjsMjml from 'grapesjs-mjml';
import GjsEditor from '@grapesjs/react';

// Wrap grapesjs-mjml so its options apply deterministically. GrapesJS resolves
// `pluginsOpts[id]` by a plugin id derived from the function (not the function
// object used as a key), so keying pluginsOpts by the imported function is
// brittle. Calling the plugin ourselves with an explicit opts object is the
// reliable way to pass MJML options. The wrapper IS the plugin we register.
const mjmlPlugin = (editor: Editor) =>
  grapesjsMjml(editor, {
    // Keep the plugin's default MJML block set (we add two Propel blocks on top).
    resetBlocks: false,
    // A sensible placeholder so a freshly-dropped mj-image isn't a blank box.
    imagePlaceholderSrc:
      'https://via.placeholder.com/600x300/eeeeee/999999?text=Image',
  });
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
} from '@mantine/core';
import {
  IconCode,
  IconBuildingSkyscraper,
  IconChevronDown,
  IconCopy,
  IconCheck,
  IconTag,
} from 'twenty-ui/display';

import 'grapesjs/dist/css/grapes.min.css';

// ── Brand kit (HARDCODED for the spike) ──────────────────────────────────────
// Real wiring pulls these from the existing brand-kit backend (the Propel app's
// `brand-kit-io` / brandKit logic-function route — same source the social
// "branded card" affordance reads): logo URL, primary + accent colors, font.
// For the spike they are a RE/MAX-style sample so the branded header looks real.
const BRAND = {
  name: 'RE/MAX Hub',
  // A neutral sample logo (RE/MAX wordmark-style). Real wiring → brandKit.logoUrl.
  logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/2/27/RE-MAX_logo.svg',
  primary: '#003DA5', // RE/MAX blue   (real wiring → brandKit.colorPrimary)
  accent: '#DC1C2E', // RE/MAX red    (real wiring → brandKit.colorAccent)
  footerText: 'RE/MAX Hub · Dubai, UAE · {{agentName}}',
} as const;

// ── Merge tags offered in the toolbar (sample set for the spike) ─────────────
// Real wiring derives the allowed token set from the campaign's audience schema
// (the same `composeAllowedKeys` the ManualWizard validates against).
const MERGE_TAGS: { token: string; label: string }[] = [
  { token: '{{firstName}}', label: 'First name' },
  { token: '{{agentName}}', label: 'Agent name' },
  { token: '{{propertyName}}', label: 'Property name' },
];

// The MJML the canvas opens with — a minimal branded skeleton so the editor is
// never an empty white box (fromElement:false means we seed via setComponents).
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
          insert a merge tag from the toolbar, then hit <strong>Export HTML</strong>.
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

export const GrapesEmailBuilder = () => {
  const editorRef = useRef<Editor | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportHtml, setExportHtml] = useState('');
  const [exportErrors, setExportErrors] = useState<string[]>([]);

  // Register the spike's custom blocks + seed the canvas once the editor mounts.
  const onEditor = useCallback((editor: Editor) => {
    editorRef.current = editor;

    // 1) Branded header — a drag-in block in its own "Propel" category.
    editor.BlockManager.add('propel-branded-header', {
      label: 'Branded header',
      category: 'Propel',
      // A tiny SVG so the block tile reads as a brand banner, not a generic box.
      media: `<svg viewBox="0 0 24 24" width="22" height="22" fill="${BRAND.accent}"><path d="M3 5h18v6H3z"/><rect x="3" y="13" width="12" height="2" fill="#9ca3af"/></svg>`,
      content: BRANDED_HEADER_MJML,
    });

    // 2) A "Merge tag" block — drops a paragraph with a sample token the user can
    //    then edit. (The toolbar Menu below inserts tokens into a SELECTED text
    //    component; this block is the drag-first alternative.)
    editor.BlockManager.add('propel-merge-tag', {
      label: 'Merge tag',
      category: 'Propel',
      media: `<svg viewBox="0 0 24 24" width="22" height="22" fill="${BRAND.primary}"><path d="M5 5h9l5 5v9H5z"/><text x="8" y="16" font-size="7" fill="#fff">{ }</text></svg>`,
      content: `<mj-text font-size="15px" color="#374151">Hi {{firstName}}, …</mj-text>`,
    });

    // Seed the starter email (the MJML plugin parses MJML passed to setComponents).
    editor.setComponents(STARTER_MJML);
  }, []);

  // Insert a merge tag into the currently-selected text component (or drop a new
  // text block carrying it if nothing suitable is selected). Uses the real
  // GrapesJS selection + component API so the token lands where the user is
  // working and the click is never a silent no-op.
  const insertMergeTag = useCallback((token: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    const selected = editor.getSelected();
    // mj-text components hold editable content; append the token inside them.
    if (selected && selected.is('mj-text')) {
      selected.append(` ${token}`);
    } else {
      editor.addComponents(
        `<mj-text font-size="15px" color="#374151">${token}</mj-text>`,
      );
    }
  }, []);

  // EXPORT — compile the canvas MJML → real cross-client HTML via the plugin's
  // 'mjml-code-to-html' command (returns { html, errors }).
  const exportProductionHtml = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const res = editor.Commands.run('mjml-code-to-html') as {
      html: string;
      errors: { message?: string; formattedMessage?: string }[];
    };
    setExportHtml(res?.html ?? '');
    setExportErrors(
      (res?.errors ?? []).map(
        (e) => e.formattedMessage ?? e.message ?? 'Unknown MJML warning',
      ),
    );
    setExportOpen(true);
  }, []);

  // Native dual MJML+HTML modal that ships with the plugin — a second way to see
  // the live compiled output (good for the founder to eyeball both panes).
  const openNativePreview = useCallback(() => {
    editorRef.current?.Commands.run('export-template');
  }, []);

  return (
    <Stack gap="xs" style={{ flex: 1, minHeight: 0 }}>
      {/* Spike toolbar — merge tags + export, themed to roughly match Pulse. */}
      <Group justify="space-between" wrap="nowrap">
        <Group gap="xs" wrap="nowrap">
          <Badge
            size="sm"
            variant="light"
            color="red"
            leftSection={<IconBuildingSkyscraper size={12} />}
          >
            SPIKE · GrapesJS + MJML
          </Badge>
          <Menu shadow="md" width={200} position="bottom-start">
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
              {MERGE_TAGS.map((t) => (
                <Menu.Item
                  key={t.token}
                  onClick={() => insertMergeTag(t.token)}
                  rightSection={
                    <Code style={{ fontSize: 11 }}>{t.token}</Code>
                  }
                >
                  {t.label}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        </Group>
        <Group gap="xs" wrap="nowrap">
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
            color="red"
            leftSection={<IconCode size={14} />}
            onClick={exportProductionHtml}
          >
            Export HTML
          </Button>
        </Group>
      </Group>

      {/* The GrapesJS editor — default UI. grapesjs-mjml swaps the block panel,
          style manager and devices for MJML-aware ones (resetBlocks etc.). */}
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
            // No persistence in the spike — the wizard owns saving.
            storageManager: false,
            fromElement: false,
            // The MJML plugin (wrapped above so its opts apply deterministically).
            plugins: [mjmlPlugin],
          }}
        />
      </Box>

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
            This is the real MJML-compiled, email-client-safe HTML. In production
            this payload is what save-campaign would persist and the send engine
            would deliver. Merge tags like <Code>{'{{firstName}}'}</Code> stay as
            tokens for the send-time personalizer to fill.
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
            Real wiring note: the branded header + colors are hardcoded for this
            spike. Production pulls them from the brand-kit backend.{' '}
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
