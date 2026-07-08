import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Anchor, Box, Center, Group, SegmentedControl, Stack, Text } from '@mantine/core';
import { IconAppWindow, IconExternalLink, IconPhone, IconWorld } from 'twenty-ui/display';
import {
  debounce,
  originOf,
  parseChildMessage,
  postRender,
  type LpSection,
  type LpTheme,
  type SectionActionKind,
} from '@/propel/lib/landingPreviewBridge';

// LP Builder v2 — Stage 2 live-preview pane (B1 / contract C1).
//
// The right half of the Landing editor: an <iframe> loading the SITE's
// /lp/preview, which renders the draft {theme, sections[]} we post over the C1
// postMessage protocol. It re-posts the draft on the child's `ready`, on any
// draft change (debounced 300ms), and on selection change; and it lifts the
// child's `sectionClick` back up so clicking a section in the preview selects it
// in the left rail (selection syncs both directions).
//
// Never crashes the hero: an empty sitePublicUrl or an iframe load failure both
// degrade to a dimmed note. All child messages are origin-checked (only the site
// origin is trusted) and source-checked ('propel-lp') before we act on them.

interface LandingPreviewPaneProps {
  sitePublicUrl: string;
  theme: LpTheme;
  sections: LpSection[];
  selectedIndex: number | null;
  // C7 — the section hovered in the left rail; forwarded to the child so it can
  // draw a dashed outline. null clears it.
  hoverIndex: number | null;
  onSelectSection: (index: number) => void;
  // C7 — the on-canvas floating toolbar's verbs bubble up here; the parent (the
  // single source of truth for sections[]) applies them and re-posts render.
  onSectionAction: (index: number, action: SectionActionKind) => void;
  // Stage 3B — the toolbar's "Edit with AI" button: the parent targets the
  // instruction bar at this section. Optional so older mounts degrade silently.
  onEditWithAi?: (index: number) => void;
  // Present only for a LIVE page → renders an "Open live page ↗" link (A5).
  liveUrl?: string;
}

type Device = 'desktop' | 'mobile';
const MOBILE_WIDTH = 390;

const DimmedNote = ({ children }: { children: React.ReactNode }) => (
  <Center h="100%" style={{ minHeight: 240 }}>
    <Stack align="center" gap="xs" style={{ maxWidth: 320, opacity: 0.6 }}>
      <IconWorld size={28} />
      <Text size="sm" c="dimmed" ta="center">
        {children}
      </Text>
    </Stack>
  </Center>
);

export const LandingPreviewPane = ({
  sitePublicUrl,
  theme,
  sections,
  selectedIndex,
  hoverIndex,
  onSelectSection,
  onSectionAction,
  onEditWithAi,
  liveUrl,
}: LandingPreviewPaneProps) => {
  const origin = useMemo(() => originOf(sitePublicUrl), [sitePublicUrl]);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const readyRef = useRef(false);
  const [device, setDevice] = useState<Device>('desktop');
  const [failed, setFailed] = useState(false);

  // Always post the LATEST draft; a ref keeps `flush` stable while the effect
  // below re-arms the debounce on every draft change.
  const draftRef = useRef({ theme, sections, selectedIndex, hoverIndex });
  draftRef.current = { theme, sections, selectedIndex, hoverIndex };

  const flush = useCallback(() => {
    if (!readyRef.current) return;
    postRender(iframeRef.current?.contentWindow ?? null, origin, draftRef.current);
  }, [origin]);

  const debouncedFlush = useMemo(() => debounce(flush, 300), [flush]);

  // Inbound child messages — origin+source checked in the bridge.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const msg = parseChildMessage(event, origin);
      if (msg === null) return;
      if (msg.type === 'ready') {
        readyRef.current = true;
        flush(); // first paint: send the current draft immediately
      } else if (msg.type === 'sectionClick') {
        onSelectSection(msg.index);
      } else if (msg.type === 'sectionAction') {
        onSectionAction(msg.index, msg.action);
      } else if (msg.type === 'editWithAi') {
        onEditWithAi?.(msg.index);
      }
      // 'height' / 'sectionHover' are accepted by the bridge but not consumed here.
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [origin, flush, onSelectSection, onSectionAction, onEditWithAi]);

  // Any draft/selection change → re-post (debounced). Selection changes ride the
  // same debounce; 300ms of highlight lag is imperceptible and coalesces bursts.
  useEffect(() => {
    debouncedFlush();
    return () => debouncedFlush.cancel();
  }, [theme, sections, selectedIndex, debouncedFlush]);

  // Hover-outline (A5/C7) is posted IMMEDIATELY (not debounced) so the outline
  // tracks the pointer without lag. Hover state changes are inherently low-
  // frequency (one per row crossing), so this never spams postMessage.
  useEffect(() => {
    flush();
  }, [hoverIndex, flush]);

  if (sitePublicUrl === '' || origin === '') {
    return (
      <Box style={{ height: '100%', borderRadius: 8, border: '1px solid var(--mantine-color-gray-3)' }}>
        <DimmedNote>Live preview available once SITE_PUBLIC_URL is configured.</DimmedNote>
      </Box>
    );
  }

  return (
    <Stack gap="xs" style={{ height: '100%', minHeight: 0 }}>
      <Group justify="space-between" align="center" wrap="nowrap">
        {liveUrl ? (
          <Anchor
            href={liveUrl}
            target="_blank"
            rel="noopener noreferrer"
            size="xs"
            c="red"
          >
            <Group gap={4} wrap="nowrap" component="span">
              <span>Open live page</span>
              <IconExternalLink size={13} />
            </Group>
          </Anchor>
        ) : (
          <span />
        )}
        <SegmentedControl
          size="xs"
          value={device}
          onChange={(v) => setDevice(v as Device)}
          data={[
            {
              value: 'desktop',
              label: (
                <Group gap={6} wrap="nowrap" justify="center" component="span">
                  <IconAppWindow size={14} />
                  <span>Desktop</span>
                </Group>
              ),
            },
            {
              value: 'mobile',
              label: (
                <Group gap={6} wrap="nowrap" justify="center" component="span">
                  <IconPhone size={14} />
                  <span>Mobile</span>
                </Group>
              ),
            },
          ]}
        />
      </Group>
      <Box
        style={{
          flex: 1,
          minHeight: 0,
          borderRadius: 8,
          border: '1px solid var(--mantine-color-gray-3)',
          overflow: 'hidden',
          background: 'var(--mantine-color-body)',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        {failed ? (
          <DimmedNote>
            Could not reach the preview site. The editor still works — publish to see the live page.
          </DimmedNote>
        ) : (
          <iframe
            ref={iframeRef}
            src={`${sitePublicUrl}/lp/preview`}
            title="Landing page live preview"
            onError={() => setFailed(true)}
            style={{
              width: device === 'mobile' ? MOBILE_WIDTH : '100%',
              maxWidth: '100%',
              height: '100%',
              border: 'none',
              display: 'block',
            }}
          />
        )}
      </Box>
    </Stack>
  );
};

export default LandingPreviewPane;
