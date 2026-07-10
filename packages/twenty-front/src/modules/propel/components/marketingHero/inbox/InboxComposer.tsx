import { useCallback, useRef, useState } from 'react';
import {
  ActionIcon,
  Box,
  Button,
  FileButton,
  Group,
  Image,
  Progress,
  Stack,
  Text,
  Textarea,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconClock,
  IconFile,
  IconPaperclip,
  IconSend,
  IconSparkles,
  IconVideo,
} from 'twenty-ui/display';
import { usePropelToast } from '@/propel/hooks/usePropelToast';
import {
  type InboxChannel,
  type InboxMediaKind,
  type InboxSurface,
  type OutboundMediaKind,
  type QuickReply,
  type QuickReplyLibrary,
} from '@/propel/types/inbox';
import {
  fetchInboxAi,
  fetchQuickReplyLibrary,
  interpretSendResult,
  sendInboxReply,
  shouldSendOnKeyDown,
  uploadInboxMedia,
} from '@/propel/lib/inboxApi';
import {
  type CannedMergeValues,
  filterQuickReplies,
  parseSlashCommand,
  resolveMergeTags,
} from '@/propel/lib/quickReplyCore';
import { InboxQuickReplyPicker } from '@/propel/components/marketingHero/inbox/InboxQuickReplyPicker';

// The outbound composer: a growing textarea (Enter-to-send, IME-guarded), an AI
// Suggest/Improve assist, a media attach (real-frontend FileReader upload — no
// worker token RPC), and the optimistic-send wiring handed up to the thread pane.
export const InboxComposer = ({
  id,
  channel,
  surface,
  mergeValues,
  actingMemberId,
  onSent,
  onPending,
  onPendingFailed,
  onPendingSent,
}: {
  id: string;
  channel: InboxChannel;
  surface: InboxSurface;
  // Contact + agent context for resolving canned-reply merge tags at insert time
  // ({{firstName}} {{fullName}} {{agentName}} {{officeName}}).
  mergeValues: CannedMergeValues;
  // The acting member's id — for the quick-reply manager's "can I edit this?" gate.
  actingMemberId: string;
  onSent: () => void;
  // onPending pushes a local "sending" bubble and returns its temp id; the optional
  // media arg shows the attachment on the optimistic bubble immediately.
  onPending: (
    body: string,
    media?: { url: string; kind: InboxMediaKind } | null,
  ) => string;
  onPendingFailed: (tempId: string) => void;
  onPendingSent: (tempId: string) => void;
}) => {
  const notify = usePropelToast();
  // FB/IG DMs fall under Meta's 24-hour standard-messaging window; comments don't,
  // and WhatsApp's session window is handled separately — so the hint is FB/IG-DM
  // only.
  const showDmWindowHint = channel !== 'WHATSAPP' && surface === 'DM';

  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  // Sticky inline error shown ABOVE the composer when a send fails (a 24h-window /
  // COMPLIANCE_BLOCK rejection used to surface only as a missable snackbar).
  const [sendError, setSendError] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState<null | 'suggest' | 'improve'>(null);
  const aiInFlight = useRef(false);
  // Bumped on every user edit AND on send. runAi captures it at start and only
  // applies its result if it hasn't changed — so a returning AI draft never
  // clobbers text typed (or a reply sent) WHILE the AI call was in flight.
  const composerEpochRef = useRef(0);

  // ── Outbound attachment ────────────────────────────────────────────────────
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaKind, setMediaKind] = useState<OutboundMediaKind>('DOCUMENT');
  const [uploadName, setUploadName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState('');
  // 0..1 for the large/presigned path (real byte-progress), or null for the small
  // inline path (single round-trip → indeterminate spinner only).
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const uploadingRef = useRef(false);
  const resetFileRef = useRef<(() => void) | null>(null);

  // ── Quick replies (canned-reply picker, TM#91) ─────────────────────────────
  const [qrOpen, setQrOpen] = useState(false);
  const [qrLibrary, setQrLibrary] = useState<QuickReplyLibrary>({
    items: [],
    canEditShared: false,
  });
  const [qrLoaded, setQrLoaded] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  // 'free' = opened via the ⚡ button (own search box); 'slash' = the draft is a
  // bare `/token` and the textarea drives the query.
  const [qrMode, setQrMode] = useState<'free' | 'slash'>('free');
  const [qrSlashQuery, setQrSlashQuery] = useState('');
  const qrLoadingRef = useRef(false);

  const hasMedia = mediaUrl.trim().length > 0;
  const hasDraft = text.trim().length > 0;

  const clearMedia = useCallback(() => {
    if (uploadingRef.current) return;
    setMediaUrl('');
    setUploadName('');
    setMediaKind('DOCUMENT');
    setUploadErr('');
    setUploadProgress(null);
    resetFileRef.current?.();
  }, []);

  // Pick (or drop/paste via FileButton). Read the File's bytes directly (real
  // frontend — no front-component token RPC). Tiny files take the inline JSON path;
  // a large doc/video routes through /marketing/media/presign → a direct B2 PUT (up
  // to 100 MB) with real byte-progress. Either way we stage the durable URL.
  const onPickFile = useCallback(
    (file: File | null) => {
      if (!file || uploadingRef.current) return;
      uploadingRef.current = true;
      setUploading(true);
      setUploadErr('');
      setUploadName(file.name);
      setUploadProgress(null);
      uploadInboxMedia(file, (fraction) => setUploadProgress(fraction))
        .then((res) => {
          if (res.ok) {
            setMediaUrl(res.url);
            setMediaKind(res.kind);
            setUploadName(res.fileName);
          } else {
            setUploadErr(res.message);
            setUploadName('');
          }
        })
        .catch(() => {
          setUploadErr('Upload failed — check your connection and try again.');
          setUploadName('');
        })
        .finally(() => {
          uploadingRef.current = false;
          setUploading(false);
          setUploadProgress(null);
        });
    },
    [],
  );

  const send = useCallback(async () => {
    const t = text.trim();
    const stagedUrl = mediaUrl.trim();
    // A reply must carry SOMETHING — text OR an attachment. Block while an upload
    // is still in flight so we never send a half-staged attachment.
    if ((!t && !stagedUrl) || sending || uploading) return;
    composerEpochRef.current += 1;

    const draft = text;
    const stagedMedia = stagedUrl
      ? { url: stagedUrl, kind: mediaKind, fileName: uploadName }
      : null;
    const tempId = onPending(
      t,
      stagedMedia
        ? { url: stagedMedia.url, kind: stagedMedia.kind as InboxMediaKind }
        : null,
    );
    setSending(true);
    setSendError(null);
    setText('');
    clearMedia();

    const res = await sendInboxReply({
      id,
      channel,
      body: t,
      media: stagedMedia,
    }).catch(() => null);
    setSending(false);

    const outcome = interpretSendResult(res);
    if (!outcome.ok) {
      // Mark the optimistic bubble FAILED (stays visible with a "Not sent" reason)
      // and restore the draft WITHOUT clobbering anything typed into the cleared
      // box while the send was in flight. The staged attachment is restored too
      // (already uploaded — its URL is still good).
      onPendingFailed(tempId);
      setText((cur) => (cur ? `${draft}\n${cur}` : draft));
      if (stagedMedia) {
        setMediaUrl(stagedMedia.url);
        setMediaKind(stagedMedia.kind);
        setUploadName(stagedMedia.fileName);
      }
      setSendError(outcome.message);
      notify(outcome.message, 'error');
      return;
    }
    // Success. Keep the optimistic bubble (as a sent bubble) until the reload
    // brings the real outbound row and reconcilePending drops it.
    onPendingSent(tempId);
    notify(outcome.message, outcome.tone);
    onSent();
  }, [
    text,
    mediaUrl,
    mediaKind,
    uploadName,
    sending,
    uploading,
    id,
    channel,
    clearMedia,
    notify,
    onPending,
    onPendingFailed,
    onPendingSent,
    onSent,
  ]);

  // Suggest (blank → draft) / Improve (draft → tighten). Both call the same authed
  // route and replace the textarea with the returned text — unless the agent
  // touched the composer meanwhile (epoch changed), in which case the result is
  // dropped rather than clobbering their in-flight text.
  const runAi = useCallback(
    async (mode: 'suggest' | 'improve') => {
      if (aiInFlight.current || sending) return;
      aiInFlight.current = true;
      const startedAtEpoch = composerEpochRef.current;
      setAiBusy(mode);
      try {
        const res = await fetchInboxAi({
          mode,
          conversationId: id,
          channel,
          ...(mode === 'improve' ? { draft: text } : {}),
        });
        if (composerEpochRef.current !== startedAtEpoch) {
          notify(
            'Your edits were kept — re-run AI assist if you still want a suggestion.',
            'info',
          );
          return;
        }
        if (!res || !res.ok || typeof res.text !== 'string' || !res.text.trim()) {
          notify(
            res?.operatorAction || res?.error || 'AI assist is unavailable right now.',
            'error',
          );
          return;
        }
        setText(res.text);
        setSendError(null);
        notify(
          mode === 'suggest'
            ? 'Suggested a reply — review before sending.'
            : 'Improved your draft — review before sending.',
          'success',
        );
      } catch {
        notify('AI assist is unavailable right now.', 'error');
      } finally {
        aiInFlight.current = false;
        setAiBusy(null);
      }
    },
    [id, channel, text, sending, notify],
  );

  // ── Quick replies ──────────────────────────────────────────────────────────
  // Lazy-load the library the first time the picker opens (or on a `/` trigger).
  // `force` re-pulls after a manage save/delete. Never blocks the composer; a
  // failure yields an empty library + empty state, never a thrown error.
  const loadQuickReplies = useCallback(async (force = false) => {
    if (qrLoadingRef.current) return;
    if (qrLoaded && !force) return;
    qrLoadingRef.current = true;
    setQrLoading(true);
    try {
      const lib = await fetchQuickReplyLibrary();
      setQrLibrary(lib);
      setQrLoaded(true);
    } finally {
      qrLoadingRef.current = false;
      setQrLoading(false);
    }
  }, [qrLoaded]);

  const ensureLibrary = useCallback(() => {
    if (!qrLoaded && !qrLoadingRef.current) void loadQuickReplies();
  }, [qrLoaded, loadQuickReplies]);

  // The ⚡ button (and the picker's own close) — always FREE mode.
  const onPickerOpenedChange = useCallback(
    (open: boolean) => {
      if (open) {
        setQrMode('free');
        ensureLibrary();
      } else {
        setQrMode('free');
        setQrSlashQuery('');
      }
      setQrOpen(open);
    },
    [ensureLibrary],
  );

  // Insert a chosen reply. Merge tags resolve from the conversation's contact/agent
  // context; an unfilled/unknown tag stays literal (the server's contract). SLASH
  // mode REPLACES the `/token` command; FREE mode APPENDS to the draft (never
  // destroying typed text). Bump the epoch so an in-flight AI result can't clobber.
  const insertQuickReply = useCallback(
    (qr: QuickReply) => {
      const resolved = resolveMergeTags(qr.body || '', mergeValues).trim();
      if (resolved) {
        if (qrMode === 'slash') {
          setText(resolved);
        } else {
          setText((d) =>
            !d
              ? resolved
              : d.endsWith(' ') || d.endsWith('\n')
                ? `${d}${resolved}`
                : `${d} ${resolved}`,
          );
        }
        composerEpochRef.current += 1;
        setSendError(null);
      }
      setQrOpen(false);
      setQrMode('free');
      setQrSlashQuery('');
    },
    [mergeValues, qrMode],
  );

  // Update the draft, then drive the `/` shortcut: a bare `/token` draft opens the
  // picker in SLASH mode (matching on the shortcut); leaving that shape closes it.
  const onTextChange = useCallback(
    (val: string) => {
      setText(val);
      composerEpochRef.current += 1;
      if (sendError) setSendError(null);
      const token = parseSlashCommand(val);
      if (token !== null) {
        setQrMode('slash');
        setQrSlashQuery(token);
        setQrOpen(true);
        ensureLibrary();
      } else if (qrMode === 'slash') {
        setQrMode('free');
        setQrSlashQuery('');
        setQrOpen(false);
      }
    },
    [sendError, qrMode, ensureLibrary],
  );

  // Enter sends, Shift+Enter inserts a newline; IME-guarded so confirming a CJK/
  // Hangul candidate with Enter never fires a half-composed message. While the
  // picker is open in SLASH mode, Enter INSERTS the top match (never sends the raw
  // `/command`), and Escape dismisses the picker.
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (qrOpen && qrMode === 'slash') {
      if (e.key === 'Escape') {
        e.preventDefault();
        setQrOpen(false);
        setQrMode('free');
        setQrSlashQuery('');
        return;
      }
      if (
        e.key === 'Enter' &&
        !e.shiftKey &&
        !e.nativeEvent?.isComposing &&
        e.keyCode !== 229
      ) {
        e.preventDefault();
        const top = filterQuickReplies(qrLibrary.items, qrSlashQuery, 'slash')[0];
        if (top) insertQuickReply(top);
        return;
      }
    }
    if (shouldSendOnKeyDown(e)) {
      e.preventDefault();
      void send();
    }
  };

  const placeholder =
    channel === 'WHATSAPP'
      ? 'Type a WhatsApp reply…'
      : surface === 'COMMENT'
        ? 'Reply to this comment…'
        : 'Type a direct message reply…';

  return (
    <Box
      style={{
        flex: 'none',
        padding: '10px 16px 12px',
        borderTop: '1px solid var(--mantine-color-default-border)',
      }}
    >
      <Stack gap={9}>
        {/* AI assist row — Suggest when blank, Improve when there's a draft */}
        <Group gap={8} align="center" mih={30}>
          <Button
            size="compact-sm"
            variant="light"
            color="red"
            leftSection={<IconSparkles size={15} />}
            disabled={aiBusy !== null || sending}
            loading={aiBusy !== null}
            onClick={() => void runAi(hasDraft ? 'improve' : 'suggest')}
          >
            {hasDraft
              ? aiBusy === 'improve'
                ? 'Improving…'
                : 'Improve with AI'
              : aiBusy === 'suggest'
                ? 'Suggesting…'
                : 'Suggest with AI'}
          </Button>
          <Text size="xs" c="dimmed">
            {aiBusy ? 'Thinking…' : hasDraft ? 'Tighten your draft' : 'Draft a reply for you'}
          </Text>
        </Group>

        {/* Sticky inline send error — stays put (unlike the snackbar) so the agent
            actually sees why a reply didn't go out; the draft is restored alongside. */}
        {sendError ? (
          <Group
            role="alert"
            gap={7}
            align="flex-start"
            wrap="nowrap"
            p="xs"
            style={{
              border: '1px solid color-mix(in oklch, var(--mantine-color-red-6) 28%, transparent)',
              background: 'color-mix(in oklch, var(--mantine-color-red-6) 10%, transparent)',
              borderRadius: 9,
            }}
          >
            <IconAlertTriangle size={14} color="var(--mantine-color-red-6)" style={{ flex: 'none', marginTop: 1 }} />
            <Text size="sm" c="red">
              {sendError}
            </Text>
          </Group>
        ) : null}

        {/* In-flight upload chip — filename + a progress bar. The large/presigned
            path reports real byte-progress; the small inline path shows an
            indeterminate (animated, no value) bar. */}
        {uploading ? (
          <Group
            gap={11}
            wrap="nowrap"
            p={8}
            style={{
              border: '1px solid var(--mantine-color-default-border)',
              borderRadius: 11,
            }}
          >
            <Box
              style={{
                width: 44,
                height: 44,
                borderRadius: 8,
                flex: 'none',
                display: 'grid',
                placeItems: 'center',
                border: '1px solid var(--mantine-color-default-border)',
                color: 'var(--mantine-color-dimmed)',
              }}
            >
              <IconPaperclip size={18} />
            </Box>
            <Box style={{ flex: 1, minWidth: 0 }}>
              <Text
                size="sm"
                fw={600}
                style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                {uploadName || 'Uploading…'}
              </Text>
              <Progress
                mt={6}
                size="sm"
                radius="xl"
                color="red"
                value={uploadProgress === null ? 100 : Math.round(uploadProgress * 100)}
                animated={uploadProgress === null}
              />
              <Text size="xs" c="dimmed" mt={3}>
                {uploadProgress === null
                  ? 'Uploading…'
                  : `Uploading… ${Math.round(uploadProgress * 100)}%`}
              </Text>
            </Box>
          </Group>
        ) : null}

        {/* Staged-attachment preview chip */}
        {!uploading && hasMedia ? (
          <Group
            gap={11}
            wrap="nowrap"
            p={8}
            style={{
              border: '1px solid var(--mantine-color-default-border)',
              borderRadius: 11,
            }}
          >
            {mediaKind === 'IMAGE' ? (
              <Image src={mediaUrl} alt="" w={44} h={44} radius="sm" fit="cover" />
            ) : (
              <Box
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 8,
                  flex: 'none',
                  display: 'grid',
                  placeItems: 'center',
                  border: '1px solid var(--mantine-color-default-border)',
                  color: 'var(--mantine-color-dimmed)',
                }}
              >
                {mediaKind === 'VIDEO' ? <IconVideo size={20} /> : <IconFile size={20} />}
              </Box>
            )}
            <Box style={{ flex: 1, minWidth: 0 }}>
              <Text
                size="sm"
                fw={600}
                style={{
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {uploadName ||
                  (mediaKind === 'IMAGE'
                    ? 'Image'
                    : mediaKind === 'VIDEO'
                      ? 'Video'
                      : mediaKind === 'AUDIO'
                        ? 'Audio'
                        : 'Document')}
              </Text>
              <Text size="xs" c="green" mt={2}>
                Attached
              </Text>
            </Box>
            <Button
              size="compact-xs"
              variant="default"
              onClick={clearMedia}
              disabled={uploading}
            >
              Remove
            </Button>
          </Group>
        ) : null}

        {uploadErr ? (
          <Text size="xs" c="yellow.7">
            {uploadErr}
          </Text>
        ) : null}

        <Group gap={10} align="flex-end" wrap="nowrap">
          {/* Quick replies — the ⚡ picker (search + manage) and the `/`-shortcut
              trigger; a chosen reply resolves merge tags and inserts into the draft. */}
          <InboxQuickReplyPicker
            opened={qrOpen}
            onOpenedChange={onPickerOpenedChange}
            mode={qrMode}
            slashQuery={qrSlashQuery}
            library={qrLibrary}
            loading={qrLoading}
            onReload={() => void loadQuickReplies(true)}
            actingMemberId={actingMemberId}
            onPick={insertQuickReply}
          />

          {/* Attach — a FileButton opening the OS picker; accepts images, video, and
              the brokerage document set. */}
          <FileButton
            onChange={onPickFile}
            resetRef={resetFileRef}
            accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"
          >
            {(props) => (
              <ActionIcon
                {...props}
                variant="default"
                size={40}
                radius="md"
                disabled={uploading}
                loading={uploading}
                aria-label="Attach a file"
                title="Attach an image, video, or document"
              >
                <IconPaperclip size={19} />
              </ActionIcon>
            )}
          </FileButton>

          <Textarea
            value={text}
            onChange={(e) => onTextChange(e.currentTarget.value)}
            onKeyDown={onKeyDown}
            autosize
            minRows={1}
            maxRows={6}
            aria-label="Message reply"
            placeholder={placeholder}
            style={{ flex: 1 }}
            styles={{ input: { opacity: aiBusy ? 0.75 : 1, transition: 'opacity 0.15s' } }}
          />

          <Button
            color="red"
            leftSection={<IconSend size={16} />}
            disabled={(!text.trim() && !hasMedia) || sending || uploading}
            loading={sending}
            onClick={() => void send()}
            style={{ flex: 'none' }}
          >
            {uploading ? 'Uploading…' : 'Send'}
          </Button>
        </Group>

        {showDmWindowHint ? (
          <Group gap={6} wrap="nowrap">
            <IconClock size={12} color="var(--mantine-color-dimmed)" style={{ flex: 'none' }} />
            <Text size="xs" c="dimmed">
              Direct messages can only be answered within 24 hours of the contact’s last
              message.
            </Text>
          </Group>
        ) : null}
        <Text size="xs" c="dimmed">
          Enter to send · Shift+Enter for a new line
        </Text>
      </Stack>
    </Box>
  );
};
