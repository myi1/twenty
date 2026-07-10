import {
  Alert,
  Badge,
  Box,
  Button,
  Center,
  Divider,
  Drawer,
  Group,
  Loader,
  Paper,
  ScrollArea,
  Stack,
  Text,
  Textarea,
  TextInput,
  Timeline,
  Title,
  Tooltip,
} from '@mantine/core';
import { useCallback, useEffect, useState } from 'react';
import {
  IconAlertTriangle,
  IconCalendar,
  IconCheck,
  IconDeviceFloppy,
  IconEdit,
  IconExternalLink,
  IconLanguage,
  IconMessage,
  IconRefresh,
  IconRepeat,
  IconSend,
  IconSparkles,
  IconTarget,
  IconX,
} from 'twenty-ui/display';
import { usePropelToast } from '@/propel/hooks/usePropelToast';
import { friendlyError } from '@/propel/lib/friendlyError';
import { useCanPublish } from '@/propel/lib/canPublish';
import { SubmissionBadge } from '@/propel/components/marketingHero/deskShared';
import { SubmitForApprovalButton } from '@/propel/components/marketingHero/SubmitForApprovalButton';
import {
  decideBlogPost,
  fetchBlogPost,
  retryBlogPost,
  reviseBlogPost,
  saveBlogDraft,
  sanitizeBlogHtml,
  cadenceLabel,
  isRecurring,
  type BlogPost,
  type BlogPostDetail,
  type BlogReviseChatEntry,
  type BlogStatus,
} from '@/propel/lib/blogCrm';

// Right-side detail drawer for a single blog post (Website → Blog). Opens on any
// card click. It renders the full detail fetched from the NEW /blog/queue `get`
// action (bodyHtml, critic notes, grounding, pipeline history, ghostUrl) and
// degrades gracefully: if that action isn't deployed yet, it shows the list-row
// fields it was handed plus a dimmed "full detail after the next backend deploy"
// note — never a blank drawer, never a crash.

const STATUS_META: Record<BlogStatus, { color: string; label: string }> = {
  IDEA: { color: 'gray', label: 'Idea' },
  GROUNDING: { color: 'blue', label: 'Grounding' },
  DRAFTING: { color: 'indigo', label: 'Drafting' },
  SEO_REVIEW: { color: 'teal', label: 'SEO review' },
  NEEDS_APPROVAL: { color: 'red', label: 'Needs approval' },
  SCHEDULED: { color: 'blue', label: 'Scheduled' },
  PUBLISHED: { color: 'teal', label: 'Published' },
  FAILED: { color: 'red', label: 'Failed' },
  REJECTED: { color: 'gray', label: 'Rejected' },
};

const formatWhen = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const MetaRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <Group gap="md" wrap="nowrap" align="flex-start">
    <Text size="xs" c="dimmed" w={110} style={{ flexShrink: 0 }}>
      {label}
    </Text>
    <Box style={{ minWidth: 0, flex: 1 }}>{value}</Box>
  </Group>
);

// The drawer takes the list row (`row`, shown immediately) plus fetches the full
// detail. `row` guarantees a non-blank drawer even before/without the get action.
export const BlogPostDrawer = ({
  row,
  onClose,
  onChanged,
}: {
  row: BlogPost | null;
  onClose: () => void;
  onChanged: () => void;
}) => {
  const notify = usePropelToast();
  // Maker-checker (Phase 2): publisher keeps "Approve"; agent → "Submit for
  // approval". Fails closed to the agent view.
  const { canPublish, loading: publishLoading } = useCanPublish();
  const opened = row !== null;

  const [detail, setDetail] = useState<BlogPostDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailAvailable, setDetailAvailable] = useState(false);
  const [busy, setBusy] = useState(false);

  // ── review-side authoring state ──────────────────────────────────────────────
  // Inline edit: seed the draft fields when the reviewer enters edit mode; Save
  // persists them as a DRAFT (never publishes). Talk-to-agent: an instruction the
  // reviewer sends to /blog/revise; `pendingInstruction` renders optimistically
  // while the agent works.
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftExcerpt, setDraftExcerpt] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [revising, setRevising] = useState(false);
  const [pendingInstruction, setPendingInstruction] = useState<string | null>(null);

  const id = row?.id ?? null;

  // Re-fetch the full detail after a mutation (save / revise) so the drawer shows
  // the freshly-persisted draft + the appended chat turn. Silent (no skeleton flash).
  const reloadDetail = useCallback(async () => {
    if (id === null) return;
    const res = await fetchBlogPost(id);
    if (res.ok) {
      setDetail(res.data);
      setDetailAvailable(true);
    }
  }, [id]);

  useEffect(() => {
    // Reset authoring state whenever the drawer target changes.
    setEditing(false);
    setInstruction('');
    setPendingInstruction(null);
    if (id === null) {
      setDetail(null);
      setDetailAvailable(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setDetail(null);
    setDetailAvailable(false);
    void fetchBlogPost(id).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (res.ok) {
        setDetail(res.data);
        setDetailAvailable(true);
      } else {
        setDetailAvailable(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (row === null) {
    return <Drawer opened={false} onClose={onClose} position="right" />;
  }

  // Prefer full detail when we have it; otherwise render off the list row.
  const post: BlogPost & Partial<BlogPostDetail> = detail ?? row;
  const meta = STATUS_META[post.status] ?? { color: 'gray', label: post.status };
  const bodyHtml = detail?.bodyHtml ?? row.bodyHtml ?? '';
  const ghostUrl = detail?.ghostUrl ?? '';
  const criticNotes = detail?.criticNotesList ?? [];
  const grounding = detail?.groundingList ?? [];
  const pipelineLog = detail?.pipelineLog ?? [];
  const reviseChat: BlogReviseChatEntry[] = detail?.reviseChat ?? [];

  // The review-side authoring layer (inline edit + talk-to-agent) is for a PENDING
  // draft only — it mirrors the backend /blog/revise gate (needs_approval) and never
  // touches a published/scheduled post. Requires the full detail (real body) loaded.
  const canAuthor = post.status === 'NEEDS_APPROVAL' && detailAvailable;

  const startEdit = () => {
    setDraftTitle(post.title ?? '');
    setDraftExcerpt(post.excerpt ?? '');
    setDraftBody(bodyHtml);
    setEditing(true);
  };

  const cancelEdit = () => setEditing(false);

  const save = async () => {
    setSaving(true);
    const res = await saveBlogDraft(row.id, {
      title: draftTitle,
      bodyHtml: draftBody,
      excerpt: draftExcerpt,
    });
    setSaving(false);
    if (res.ok) {
      notify('Draft saved', 'success');
      setEditing(false);
      await reloadDetail();
      onChanged();
    } else {
      notify(res.error, 'error');
    }
  };

  const sendInstruction = async () => {
    const text = instruction.trim();
    if (text === '' || revising) return;
    setRevising(true);
    setPendingInstruction(text);
    const res = await reviseBlogPost(row.id, text);
    setRevising(false);
    setPendingInstruction(null);
    if (res.ok) {
      setInstruction('');
      notify(res.data.summary || 'The draft was revised.', 'success');
      await reloadDetail();
      onChanged();
    } else {
      notify(res.error, 'error');
    }
  };

  const decide = async (action: 'approve' | 'reject') => {
    setBusy(true);
    const res = await decideBlogPost(row.id, action);
    setBusy(false);
    if (res.ok) {
      notify(
        action === 'approve' ? 'Approved → scheduled to publish' : 'Draft rejected',
        'success',
      );
      onChanged();
      onClose();
    } else {
      notify(res.error, 'error');
    }
  };

  const retry = async () => {
    setBusy(true);
    const res = await retryBlogPost(row.id);
    setBusy(false);
    if (res.ok) {
      notify('Retry queued — the pipeline will re-run this post.', 'success');
      onChanged();
      onClose();
    } else {
      notify(res.error, 'error');
    }
  };

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size="min(760px, 94vw)"
      padding={0}
      withCloseButton={false}
      styles={{
        body: { height: '100%', padding: 0 },
        content: { display: 'flex', flexDirection: 'column' },
      }}
    >
      {/* header */}
      <Group
        justify="space-between"
        align="flex-start"
        wrap="nowrap"
        px="lg"
        py="md"
        style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
      >
        <Box style={{ minWidth: 0 }}>
          <Group gap={8} mb={4}>
            <Badge color={meta.color} variant="light" radius="sm">
              {meta.label}
            </Badge>
            <SubmissionBadge
              submittedForApprovalAt={post.submittedForApprovalAt}
              sentBackAt={post.sentBackAt}
              sentBackNote={post.sentBackNote}
            />
            {post.locale ? (
              <Badge
                size="sm"
                variant="light"
                color="gray"
                leftSection={<IconLanguage size={11} />}
              >
                {post.locale.toUpperCase()}
              </Badge>
            ) : null}
          </Group>
          <Title order={4} style={{ lineHeight: 1.25 }}>
            {post.title}
          </Title>
        </Box>
        <Group gap="xs" wrap="nowrap">
          {canAuthor && !editing ? (
            <Button
              size="compact-sm"
              variant="light"
              color="red"
              onClick={startEdit}
              leftSection={<IconEdit size={14} />}
            >
              Edit draft
            </Button>
          ) : null}
          <Button
            size="compact-sm"
            variant="subtle"
            color="gray"
            onClick={onClose}
            leftSection={<IconX size={14} />}
          >
            Close
          </Button>
        </Group>
      </Group>

      <ScrollArea style={{ flex: 1 }} type="auto">
        <Stack gap="lg" p="lg">
          {loading ? (
            <Center h={60}>
              <Loader size="sm" color="red" />
            </Center>
          ) : !detailAvailable ? (
            <Alert
              color="gray"
              variant="light"
              icon={<IconAlertTriangle size={16} />}
            >
              <Text size="sm" c="dimmed">
                Showing the summary this board already has — the full body, critic
                notes and pipeline history load once the blog detail route is
                deployed to this workspace.
              </Text>
            </Alert>
          ) : null}

          {/* FAILED — surface the error first */}
          {post.status === 'FAILED' && post.lastError ? (
            <Alert
              color="red"
              variant="light"
              icon={<IconAlertTriangle size={16} />}
              title="This post failed"
            >
              <Stack gap="sm" align="flex-start">
                <Text size="sm">{friendlyError(post.lastError, 'pipeline')}</Text>
                <Button
                  size="compact-sm"
                  color="red"
                  variant="light"
                  leftSection={<IconRefresh size={13} />}
                  loading={busy}
                  onClick={() => void retry()}
                >
                  Retry
                </Button>
              </Stack>
            </Alert>
          ) : null}

          {/* meta block */}
          <Paper withBorder radius="md" p="md">
            <Stack gap="sm">
              {post.topicSeed ? (
                <MetaRow
                  label="Topic seed"
                  value={<Text size="sm">{post.topicSeed}</Text>}
                />
              ) : null}
              {post.angle ? (
                <MetaRow label="Angle" value={<Text size="sm">{post.angle}</Text>} />
              ) : null}
              {typeof post.criticScore === 'number' ? (
                <MetaRow
                  label="Critic score"
                  value={
                    <Group gap={6}>
                      <Badge
                        variant="light"
                        color={
                          post.criticScore >= 80
                            ? 'teal'
                            : post.criticScore >= 60
                              ? 'yellow'
                              : 'red'
                        }
                        leftSection={<IconTarget size={11} />}
                      >
                        {post.criticScore} / 100
                      </Badge>
                    </Group>
                  }
                />
              ) : null}
              {post.scheduledAt ? (
                <MetaRow
                  label="Scheduled"
                  value={
                    <Group gap={6} wrap="nowrap">
                      <IconCalendar size={13} />
                      <Text size="sm">{formatWhen(post.scheduledAt)}</Text>
                    </Group>
                  }
                />
              ) : null}
              {isRecurring(post.cadence) ? (
                <MetaRow
                  label="Cadence"
                  value={
                    <Stack gap={2}>
                      <Group gap={6} wrap="nowrap">
                        <IconRepeat size={13} />
                        <Text size="sm">Recurs {cadenceLabel(post.cadence).toLowerCase()}</Text>
                      </Group>
                      <Text size="xs" c="dimmed">
                        {post.recurrenceSpawnedAt
                          ? 'The next edition has been seeded on the same topic.'
                          : 'The next edition seeds automatically when this one publishes — it still goes through sign-off.'}
                      </Text>
                    </Stack>
                  }
                />
              ) : null}
              {post.updatedAt ? (
                <MetaRow
                  label="Last updated"
                  value={<Text size="sm">{formatWhen(post.updatedAt)}</Text>}
                />
              ) : null}
            </Stack>
          </Paper>

          {/* inline edit form (DRAFT save — never publishes) */}
          {editing ? (
            <Paper withBorder radius="md" p="md">
              <Stack gap="sm">
                <Group gap={6} wrap="nowrap">
                  <IconEdit size={14} color="var(--mantine-color-red-6)" />
                  <Text size="xs" c="dimmed" fw={600}>
                    EDITING DRAFT — saving keeps it pending, it does not publish
                  </Text>
                </Group>
                <TextInput
                  label="Title"
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.currentTarget.value)}
                  disabled={saving}
                />
                <Textarea
                  label="Excerpt"
                  value={draftExcerpt}
                  onChange={(e) => setDraftExcerpt(e.currentTarget.value)}
                  autosize
                  minRows={2}
                  maxRows={4}
                  disabled={saving}
                />
                <Textarea
                  label="Body (HTML)"
                  value={draftBody}
                  onChange={(e) => setDraftBody(e.currentTarget.value)}
                  autosize
                  minRows={10}
                  maxRows={24}
                  disabled={saving}
                  styles={{ input: { fontFamily: 'var(--font-mono, monospace)', fontSize: 12 } }}
                />
                <Group justify="flex-end" gap="xs">
                  <Button
                    size="compact-sm"
                    variant="default"
                    onClick={cancelEdit}
                    disabled={saving}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="compact-sm"
                    color="red"
                    leftSection={<IconDeviceFloppy size={14} />}
                    loading={saving}
                    onClick={() => void save()}
                  >
                    Save draft
                  </Button>
                </Group>
              </Stack>
            </Paper>
          ) : null}

          {!editing && post.excerpt ? (
            <Box>
              <Text size="xs" c="dimmed" fw={600} mb={4}>
                EXCERPT
              </Text>
              <Text size="sm">{post.excerpt}</Text>
            </Box>
          ) : null}

          {/* pipeline timeline */}
          {pipelineLog.length > 0 ? (
            <Box>
              <Text size="xs" c="dimmed" fw={600} mb="xs">
                PIPELINE HISTORY
              </Text>
              <Timeline
                active={pipelineLog.length - 1}
                bulletSize={16}
                lineWidth={2}
                color="red"
              >
                {pipelineLog.map((entry, i) => (
                  <Timeline.Item
                    key={`${entry.stage}-${i}`}
                    title={
                      <Text size="sm" fw={600}>
                        {STATUS_META[entry.stage as BlogStatus]?.label ??
                          entry.stage ??
                          'Step'}
                      </Text>
                    }
                  >
                    {entry.note ? (
                      <Text size="xs" c="dimmed">
                        {friendlyError(entry.note, 'pipeline')}
                      </Text>
                    ) : null}
                    {entry.at ? (
                      <Text size="xs" c="dimmed">
                        {formatWhen(entry.at)}
                      </Text>
                    ) : null}
                  </Timeline.Item>
                ))}
              </Timeline>
            </Box>
          ) : null}

          {/* critic notes */}
          {criticNotes.length > 0 ? (
            <Box>
              <Text size="xs" c="dimmed" fw={600} mb="xs">
                CRITIC NOTES
              </Text>
              <Stack gap={6}>
                {criticNotes.map((note, i) => (
                  <Group key={i} gap={8} wrap="nowrap" align="flex-start">
                    <IconCheck
                      size={14}
                      style={{ marginTop: 3, flexShrink: 0 }}
                      color="var(--mantine-color-teal-6)"
                    />
                    <Text size="sm">{note}</Text>
                  </Group>
                ))}
              </Stack>
            </Box>
          ) : null}

          {/* grounding sources */}
          {grounding.length > 0 ? (
            <Box>
              <Text size="xs" c="dimmed" fw={600} mb="xs">
                GROUNDING SOURCES
              </Text>
              <Stack gap={4}>
                {grounding.map((src, i) => (
                  <Text key={i} size="sm" c="dimmed">
                    • {src}
                  </Text>
                ))}
              </Stack>
            </Box>
          ) : null}

          {/* body (hidden while the inline editor is open) */}
          {!editing && bodyHtml ? (
            <Box>
              <Text size="xs" c="dimmed" fw={600} mb="xs">
                BODY
              </Text>
              <Paper withBorder radius="md" p="md">
                <Box
                  className="propel-blog-body"
                  style={{ fontSize: 14, lineHeight: 1.6, wordBreak: 'break-word' }}
                  // Sanitized in the data layer (sanitizeBlogHtml strips
                  // script/style/iframe/on*-handlers/javascript: before render).
                  dangerouslySetInnerHTML={{ __html: sanitizeBlogHtml(bodyHtml) }}
                />
              </Paper>
            </Box>
          ) : !editing && detailAvailable ? (
            <Text size="sm" c="dimmed">
              No body content yet — this post hasn&apos;t been drafted.
            </Text>
          ) : null}

          {/* talk-to-agent: the review-side revise chat. Shows the conversation and,
              for a pending draft, an input to send the agent a plain-language change. */}
          {!editing && (canAuthor || reviseChat.length > 0) ? (
            <Box>
              <Group gap={6} mb="xs" wrap="nowrap">
                <IconSparkles size={13} color="var(--mantine-color-red-6)" />
                <Text size="xs" c="dimmed" fw={600}>
                  TALK TO THE AGENT
                </Text>
              </Group>

              {reviseChat.length > 0 || pendingInstruction ? (
                <Stack gap="xs" mb={canAuthor ? 'sm' : 0}>
                  {reviseChat.map((entry, i) => (
                    <Group
                      key={i}
                      justify={entry.role === 'reviewer' ? 'flex-end' : 'flex-start'}
                      wrap="nowrap"
                    >
                      <Paper
                        withBorder
                        radius="md"
                        px="sm"
                        py={6}
                        maw="82%"
                        bg={
                          entry.role === 'reviewer'
                            ? 'var(--mantine-color-red-light)'
                            : 'var(--mantine-color-default)'
                        }
                      >
                        <Group gap={5} mb={2} wrap="nowrap">
                          {entry.role === 'agent' ? (
                            <IconSparkles size={11} color="var(--mantine-color-red-6)" />
                          ) : (
                            <IconMessage size={11} />
                          )}
                          <Text size="9px" c="dimmed" fw={700} tt="uppercase">
                            {entry.role === 'reviewer' ? 'You' : 'Agent'}
                          </Text>
                        </Group>
                        <Text size="sm">{entry.text}</Text>
                      </Paper>
                    </Group>
                  ))}
                  {pendingInstruction ? (
                    <Group justify="flex-end" wrap="nowrap">
                      <Paper
                        withBorder
                        radius="md"
                        px="sm"
                        py={6}
                        maw="82%"
                        bg="var(--mantine-color-red-light)"
                        style={{ opacity: 0.6 }}
                      >
                        <Text size="sm">{pendingInstruction}</Text>
                      </Paper>
                    </Group>
                  ) : null}
                </Stack>
              ) : null}

              {canAuthor ? (
                <Group gap="xs" align="flex-end" wrap="nowrap">
                  <Textarea
                    style={{ flex: 1 }}
                    placeholder="e.g. make it punchier · add a section on service charges · less salesy, more analytical"
                    value={instruction}
                    onChange={(e) => setInstruction(e.currentTarget.value)}
                    autosize
                    minRows={1}
                    maxRows={4}
                    disabled={revising}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                        e.preventDefault();
                        void sendInstruction();
                      }
                    }}
                  />
                  <Button
                    color="red"
                    leftSection={<IconSend size={14} />}
                    loading={revising}
                    disabled={instruction.trim() === ''}
                    onClick={() => void sendInstruction()}
                  >
                    Send
                  </Button>
                </Group>
              ) : null}
              {canAuthor ? (
                <Text size="xs" c="dimmed" mt={4}>
                  The agent revises the draft in place — figures stay grounded, and it
                  stays pending for your approval.
                </Text>
              ) : null}
            </Box>
          ) : null}
        </Stack>
      </ScrollArea>

      {/* footer actions */}
      <Divider />
      <Group justify="space-between" px="lg" py="md" wrap="nowrap">
        <Box>
          {post.status === 'PUBLISHED' && ghostUrl ? (
            <Button
              component="a"
              href={ghostUrl}
              target="_blank"
              rel="noopener noreferrer"
              variant="light"
              color="teal"
              size="sm"
              rightSection={<IconExternalLink size={14} />}
            >
              View live post
            </Button>
          ) : post.status === 'PUBLISHED' ? (
            <Tooltip label="The live URL loads with the full detail route.">
              <Text size="xs" c="dimmed">
                Published
              </Text>
            </Tooltip>
          ) : null}
        </Box>
        {post.status === 'NEEDS_APPROVAL' ? (
          <Group gap="xs" wrap="nowrap">
            <Button
              variant="default"
              size="sm"
              leftSection={<IconX size={14} />}
              disabled={busy}
              onClick={() => void decide('reject')}
            >
              Reject
            </Button>
            {publishLoading ? (
              <Button color="red" size="sm" leftSection={<IconCheck size={14} />} disabled>
                Approve
              </Button>
            ) : canPublish ? (
              <Button
                color="red"
                size="sm"
                leftSection={<IconCheck size={14} />}
                loading={busy}
                onClick={() => void decide('approve')}
              >
                Approve
              </Button>
            ) : (
              <SubmitForApprovalButton
                kind="BLOG"
                id={row.id}
                alreadySubmitted={
                  post.submittedForApprovalAt != null && post.submittedForApprovalAt !== ''
                }
                onSubmitted={() => {
                  onChanged();
                  onClose();
                }}
                iconSize={14}
              />
            )}
          </Group>
        ) : null}
      </Group>
    </Drawer>
  );
};
