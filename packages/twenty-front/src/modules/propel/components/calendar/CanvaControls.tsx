import { Button, Group, Text, Tooltip } from '@mantine/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { IconPaint, IconExternalLink, IconRefresh } from 'twenty-ui-deprecated/display';
import {
  createCanvaDesign,
  exportCanvaDesign,
  fetchCanvaStatus,
  startCanvaConnect,
} from '@/propel/lib/canvaConnect';
import { type CanvaStatus } from '@/propel/types/canvaConnect';

// The composer's "Design in Canva" round-trip affordance (Canva Connect API).
//   • Each agent connects THEIR OWN Canva account (OAuth — opens in a new tab).
//   • Connected → "Design in Canva" creates a design (seeded with the post's current
//     image when present) and opens the Canva editor in a new tab, then shows
//     "I'm done — pull my design in".
//   • Pull → exports the design as PNG, re-hosts it to B2, and the PARENT swaps it
//     onto the post (onPulledImage) — the image flows back automatically.
//
// HONEST STATES: loading · disabled (not configured on this env) · disconnected ·
// connecting · designing · pulling · error. We NEVER show a connected/design button
// when the env isn't configured.
//
// This component owns its own status + design lifecycle (transient UI), but does NOT
// touch the post's media directly — the parent attaches the pulled image and gates
// Save (same contract as AiImageControls / brand-card).

// Phase the round-trip is in (once connected).
type Phase =
  | { kind: 'idle' }
  | { kind: 'connecting' }
  | { kind: 'designing' }
  | { kind: 'open'; designId: string; editUrl: string } // editor opened, awaiting "pull in"
  | { kind: 'pulling'; designId: string };

export const CanvaControls = ({
  getSeedImage,
  width,
  height,
  onPulledImage,
  onError,
}: {
  /** returns the post's current image bytes to seed the Canva design (or null). */
  getSeedImage: () => Promise<{ base64: string; contentType: string } | null>;
  /** intended design dimensions (the post's first image / network default). */
  width?: number;
  height?: number;
  /** parent attaches the pulled (re-hosted) PNG to the post as a ready media tile. */
  onPulledImage: (url: string) => void;
  /** surface an error in the composer's shared inline slot. */
  onError: (message: string, operatorAction: string | null) => void;
}) => {
  const [status, setStatus] = useState<CanvaStatus>({ kind: 'loading' });
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  // Guard against setting state after unmount across the async round-trips.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refreshStatus = useCallback(async () => {
    const s = await fetchCanvaStatus();
    if (mounted.current) setStatus(s);
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  // The OAuth callback page posts { source:'propel-canva', type:'connected'|'error' }
  // to its opener (this tab). When connected, re-fetch status so the button flips
  // without a manual refresh.
  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      const data = ev.data as { source?: string; type?: string } | null;
      if (data?.source !== 'propel-canva') return;
      if (data.type === 'connected') {
        void refreshStatus();
      } else if (data.type === 'error') {
        if (mounted.current) onError('Canva connection was cancelled or failed.', 'Try connecting again.');
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [refreshStatus, onError]);

  const connect = useCallback(async () => {
    if (phase.kind === 'connecting') return;
    setPhase({ kind: 'connecting' });
    const res = await startCanvaConnect();
    if (!mounted.current) return;
    if (res.ok) {
      // Open Canva's authorize page in a new tab; the callback signals us back.
      window.open(res.authorizeUrl, '_blank', 'noopener,noreferrer');
      setPhase({ kind: 'idle' });
    } else {
      setPhase({ kind: 'idle' });
      onError(res.message, res.operatorAction);
    }
  }, [phase.kind, onError]);

  const design = useCallback(async () => {
    if (phase.kind === 'designing') return;
    setPhase({ kind: 'designing' });
    const seed = await getSeedImage();
    const res = await createCanvaDesign({
      title: 'RE/MAX Hub social post',
      width,
      height,
      imageBytes: seed?.base64 ?? null,
      contentType: seed?.contentType ?? null,
    });
    if (!mounted.current) return;
    if (res.ok) {
      window.open(res.editUrl, '_blank', 'noopener,noreferrer');
      setPhase({ kind: 'open', designId: res.designId, editUrl: res.editUrl });
    } else {
      setPhase({ kind: 'idle' });
      // A "connect first" error means the connection dropped — re-check status.
      if (res.message.toLowerCase().includes('connect')) void refreshStatus();
      onError(res.message, res.operatorAction);
    }
  }, [phase.kind, getSeedImage, width, height, onError, refreshStatus]);

  const pull = useCallback(async () => {
    if (phase.kind !== 'open') return;
    const designId = phase.designId;
    setPhase({ kind: 'pulling', designId });
    const res = await exportCanvaDesign(designId);
    if (!mounted.current) return;
    if (res.ok) {
      onPulledImage(res.url);
      setPhase({ kind: 'idle' });
    } else {
      // Keep the design open so the agent can retry the pull.
      setPhase({ kind: 'open', designId, editUrl: phase.editUrl });
      onError(res.message, res.operatorAction);
    }
  }, [phase, onPulledImage, onError]);

  // ── render ─────────────────────────────────────────────────────────────────
  if (status.kind === 'loading') {
    return (
      <Text size="xs" c="dimmed">
        Checking Canva…
      </Text>
    );
  }

  if (status.kind === 'disabled') {
    return (
      <Tooltip
        label="Canva isn’t set up on this environment yet. Your admin needs to register a Canva integration."
        withArrow
        multiline
        w={260}
      >
        <Button size="compact-xs" variant="subtle" color="gray" leftSection={<IconPaint size={13} />} disabled>
          Design in Canva
        </Button>
      </Tooltip>
    );
  }

  if (status.kind === 'error') {
    return (
      <Group gap={6}>
        <Button
          size="compact-xs"
          variant="subtle"
          color="gray"
          leftSection={<IconRefresh size={13} />}
          onClick={() => void refreshStatus()}
        >
          Retry Canva
        </Button>
        <Text size="xs" c="dimmed">
          {status.message}
        </Text>
      </Group>
    );
  }

  if (status.kind === 'disconnected') {
    return (
      <Tooltip label="Connect your own Canva account to design posts in Canva" withArrow multiline w={240}>
        <Button
          size="compact-xs"
          variant="light"
          color="violet"
          leftSection={<IconPaint size={13} />}
          rightSection={<IconExternalLink size={12} />}
          onClick={() => void connect()}
          loading={phase.kind === 'connecting'}
        >
          Connect your Canva account
        </Button>
      </Tooltip>
    );
  }

  // connected
  const busy = phase.kind === 'designing' || phase.kind === 'pulling';
  return (
    <div className="propel-canva">
      <Group gap={8} align="center" wrap="wrap">
        {phase.kind === 'open' || phase.kind === 'pulling' ? (
          <>
            <Tooltip label="Open the Canva editor again" withArrow>
              <Button
                size="compact-xs"
                variant="subtle"
                color="violet"
                leftSection={<IconExternalLink size={13} />}
                onClick={() =>
                  phase.kind === 'open'
                    ? window.open(phase.editUrl, '_blank', 'noopener,noreferrer')
                    : undefined
                }
                disabled={phase.kind === 'pulling'}
              >
                Editing in Canva…
              </Button>
            </Tooltip>
            <Tooltip label="Export your finished design and add it to this post" withArrow multiline w={240}>
              <Button
                size="compact-sm"
                color="violet"
                leftSection={<IconPaint size={13} />}
                onClick={() => void pull()}
                loading={phase.kind === 'pulling'}
              >
                I’m done — pull my design in
              </Button>
            </Tooltip>
          </>
        ) : (
          <Tooltip
            label="Create a Canva design (seeded with this post’s image when present) and open the editor"
            withArrow
            multiline
            w={260}
          >
            <Button
              size="compact-sm"
              variant="light"
              color="violet"
              leftSection={<IconPaint size={13} />}
              rightSection={<IconExternalLink size={12} />}
              onClick={() => void design()}
              loading={phase.kind === 'designing'}
              disabled={busy}
            >
              Design in Canva
            </Button>
          </Tooltip>
        )}
      </Group>

      <AnimatePresence>
        {status.kind === 'connected' && status.displayName ? (
          <motion.div
            key="propel-canva-who"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Text size="xs" c="dimmed" mt={4}>
              Connected as {status.displayName}
            </Text>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {phase.kind === 'designing' ? (
        <Text size="xs" c="dimmed" mt={4}>
          Opening Canva…
        </Text>
      ) : null}
      {phase.kind === 'pulling' ? (
        <Text size="xs" c="dimmed" mt={4}>
          Pulling your design in…
        </Text>
      ) : null}
    </div>
  );
};
