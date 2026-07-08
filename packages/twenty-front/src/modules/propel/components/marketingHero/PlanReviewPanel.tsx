import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Box,
  Button,
  Center,
  Drawer,
  Group,
  Image,
  Loader,
  Paper,
  Stack,
  Text,
  Textarea,
  ThemeIcon,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconCalendarEvent,
  IconCheck,
  IconDeviceFloppy,
  IconPhoto,
} from 'twenty-ui/display';
import { usePropelToast } from '@/propel/hooks/usePropelToast';
import {
  MediaStudioModal,
  ProjectAssetsProvider,
} from '@/propel/components/website/MediaStudioModal';
import { savePost } from '@/propel/lib/socialComposer';
import { formatDateTime, parseMediaRefs } from '@/propel/lib/socialPostDetail';
import {
  type PlanDetail,
  type PlanPost,
  approvePlan,
  dismissPlan,
  getPlan,
  groupPlanPosts,
  needsPermit,
} from '@/propel/lib/socialCrm';
import { type SocialNetwork } from '@/propel/types/socialCalendar';

// Social Bench 4S-A — the plan review. Loads a PROPOSED socialContentPlan and its
// per-platform child drafts (getPlan), groups them by campaign idea/day, and lets
// the founder edit copy + swap images (reusing the existing save-post route + the
// Media Studio) before a one-click "Approve all". A property post that lacks a
// permit shows a red "Permit required" chip and blocks approval (the RERA
// checkpoint — SP4). On success the children flip DRAFT → SCHEDULED and appear on
// the existing calendar.

const PLATFORM_LABEL: Record<SocialNetwork, string> = {
  FACEBOOK: 'Facebook',
  INSTAGRAM: 'Instagram',
  LINKEDIN: 'LinkedIn',
  TIKTOK: 'TikTok',
};

const PLATFORM_COLOR: Record<SocialNetwork, string> = {
  FACEBOOK: 'blue',
  INSTAGRAM: 'grape',
  LINKEDIN: 'cyan',
  TIKTOK: 'dark',
};

// The image URLs to (re-)send with a save: a picked full URL replaces everything,
// else round-trip the post's existing media (public URL where we have it, else the
// opaque ref — same as the calendar reschedule path).
const existingImageUrls = (post: PlanPost): string[] =>
  parseMediaRefs(post.mediaRefs)
    .map((m) => m.url ?? m.ref)
    .filter((u): u is string => typeof u === 'string' && u !== '');

const firstRenderableImage = (
  post: PlanPost,
  pickedFullUrl: string | null,
): string | null => {
  if (pickedFullUrl !== null) return pickedFullUrl;
  const media = parseMediaRefs(post.mediaRefs).find((m) => m.url !== null);
  return media?.url ?? null;
};

// ── one per-platform review card ───────────────────────────────────────────────
const PlanPostCard = ({
  post,
  sitePublicUrl,
  projectName,
  blocked,
  onSaved,
}: {
  post: PlanPost;
  sitePublicUrl: string;
  projectName: string;
  blocked: boolean;
  onSaved: () => void;
}) => {
  const notify = usePropelToast();
  const [body, setBody] = useState(post.body);
  // A full URL picked from the Media Studio this session (sitePublicUrl+gatewayPath).
  // null → the post keeps its existing media.
  const [pickedImage, setPickedImage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Reset local edits if the underlying post changes (a plan reload).
  useEffect(() => {
    setBody(post.body);
    setPickedImage(null);
  }, [post.id, post.body, post.mediaRefs]);

  const dirty = body !== post.body || pickedImage !== null;
  const permitBlocked = blocked || needsPermit(post);
  const thumb = firstRenderableImage(post, pickedImage);

  const save = async () => {
    setSaving(true);
    const imageUrls =
      pickedImage !== null ? [pickedImage] : existingImageUrls(post);
    const networks: SocialNetwork[] = post.platform !== null ? [post.platform] : [];
    const res = await savePost({
      postId: post.id,
      body,
      networks,
      imageUrls,
      listingId: post.listingId,
      attestedNoProperty: post.attestedNoProperty ?? false,
      scheduledAt: post.scheduledAt,
    });
    setSaving(false);
    if (res.ok) {
      notify('Post updated.', 'success');
      onSaved();
    } else {
      notify(res.operatorAction ?? res.message, 'error');
    }
  };

  return (
    <Paper
      withBorder
      radius="md"
      p="sm"
      style={
        permitBlocked
          ? { borderColor: 'var(--mantine-color-red-5)', borderWidth: 2 }
          : undefined
      }
    >
      <Group justify="space-between" align="center" mb="xs" wrap="nowrap">
        <Group gap={6} wrap="nowrap">
          {post.platform !== null ? (
            <Badge color={PLATFORM_COLOR[post.platform]} variant="light" size="sm">
              {PLATFORM_LABEL[post.platform]}
            </Badge>
          ) : null}
          {post.scheduledAt !== null ? (
            <Text size="xs" c="dimmed">
              {formatDateTime(post.scheduledAt)}
            </Text>
          ) : (
            <Text size="xs" c="dimmed">
              Unscheduled
            </Text>
          )}
        </Group>
        {permitBlocked ? (
          <Badge color="red" variant="filled" size="sm" leftSection={<IconAlertTriangle size={12} />}>
            Permit required
          </Badge>
        ) : null}
      </Group>

      <Group align="flex-start" gap="sm" wrap="nowrap">
        <Box style={{ width: 96, flexShrink: 0 }}>
          {thumb !== null ? (
            <Image
              src={thumb}
              radius="sm"
              h={96}
              w={96}
              fit="cover"
              alt="Post image"
            />
          ) : (
            <Center
              h={96}
              w={96}
              style={{
                borderRadius: 8,
                border: '1px dashed var(--mantine-color-default-border)',
              }}
            >
              <IconPhoto size={20} color="var(--mantine-color-dimmed)" />
            </Center>
          )}
          <Box mt={6}>
            <MediaStudioModal
              sitePublicUrl={sitePublicUrl}
              fieldLabel="Post image"
              projectName={projectName}
              onPick={(gatewayPath) =>
                setPickedImage(`${sitePublicUrl}${gatewayPath}`)
              }
            />
          </Box>
        </Box>

        <Box style={{ flex: 1, minWidth: 0 }}>
          <Textarea
            autosize
            minRows={3}
            maxRows={10}
            value={body}
            onChange={(e) => setBody(e.currentTarget.value)}
          />
        </Box>
      </Group>

      {dirty ? (
        <Group justify="flex-end" mt="xs">
          <Button
            size="compact-sm"
            variant="light"
            color="red"
            leftSection={<IconDeviceFloppy size={14} />}
            loading={saving}
            onClick={save}
          >
            Save post
          </Button>
        </Group>
      ) : null}
    </Paper>
  );
};

interface PlanReviewPanelProps {
  // null → the drawer is closed. A non-null id opens the drawer and loads the plan.
  planId: string | null;
  onClose: () => void;
  // Called after a successful approval so the parent reloads the calendar.
  onApproved: () => void;
}

export const PlanReviewPanel = ({
  planId,
  onClose,
  onApproved,
}: PlanReviewPanelProps) => {
  const notify = usePropelToast();
  const [detail, setDetail] = useState<PlanDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  // Post ids the plan-approve gate flagged PERMIT_REQUIRED — highlighted + blocking.
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (planId === null) return;
    setLoading(true);
    setError(null);
    const res = await getPlan(planId);
    setLoading(false);
    if (res.ok) {
      setDetail(res.data);
    } else {
      setDetail(null);
      setError(res.error);
    }
  }, [planId]);

  useEffect(() => {
    if (planId === null) {
      setDetail(null);
      setError(null);
      setBlockedIds(new Set());
      return;
    }
    void load();
  }, [planId, load]);

  const approve = async () => {
    if (planId === null) return;
    setApproving(true);
    const res = await approvePlan(planId);
    setApproving(false);
    if (res.ok) {
      notify(
        res.scheduled > 0
          ? `Approved — ${res.scheduled} post${res.scheduled === 1 ? '' : 's'} scheduled onto the calendar.`
          : 'Campaign approved.',
        'success',
      );
      setBlockedIds(new Set());
      onApproved();
      onClose();
      return;
    }
    if (res.permitRequired) {
      setBlockedIds(new Set(res.posts.map((p) => p.id)));
      notify(
        'Attach a permit to the highlighted property posts before approving.',
        'error',
      );
      return;
    }
    notify(res.error, 'error');
  };

  const dismiss = async () => {
    if (planId === null) return;
    setApproving(true);
    const res = await dismissPlan(planId);
    setApproving(false);
    if (res.ok) {
      notify('Campaign dismissed.', 'info');
      onApproved();
      onClose();
    } else {
      notify(res.error, 'error');
    }
  };

  const groups = detail ? groupPlanPosts(detail.posts) : [];
  const propertyBlockedCount = detail
    ? detail.posts.filter((p) => blockedIds.has(p.id) || needsPermit(p)).length
    : 0;

  return (
    <Drawer
      opened={planId !== null}
      onClose={onClose}
      position="right"
      size="min(720px, 96vw)"
      padding={0}
      withCloseButton={false}
      zIndex={4000}
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
        <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
          <ThemeIcon size="lg" variant="light" color="red">
            <IconCalendarEvent size={18} />
          </ThemeIcon>
          <Box style={{ minWidth: 0 }}>
            <Text fw={700} truncate>
              {detail?.plan.name || 'Campaign plan'}
            </Text>
            <Text size="xs" c="dimmed" lineClamp={1}>
              {detail
                ? `${detail.posts.length} proposed post${detail.posts.length === 1 ? '' : 's'} · review, edit, then approve`
                : 'Loading…'}
            </Text>
          </Box>
        </Group>
        <Button variant="default" size="sm" onClick={onClose} disabled={approving}>
          Close
        </Button>
      </Group>

      {/* body */}
      <Box style={{ flex: 1, minHeight: 0, overflowY: 'auto' }} p="lg">
        {loading ? (
          <Center h={240}>
            <Loader color="red" />
          </Center>
        ) : error !== null ? (
          <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />}>
            {error}
          </Alert>
        ) : detail === null || detail.posts.length === 0 ? (
          <Paper withBorder p="xl" radius="md" style={{ borderStyle: 'dashed' }}>
            <Stack align="center" gap="xs">
              <IconCalendarEvent size={28} />
              <Text c="dimmed" size="sm" ta="center">
                This plan has no proposed posts yet.
              </Text>
            </Stack>
          </Paper>
        ) : (
          <ProjectAssetsProvider>
            <Stack gap="lg">
              {propertyBlockedCount > 0 ? (
                <Alert
                  color="red"
                  variant="light"
                  icon={<IconAlertTriangle size={16} />}
                >
                  {propertyBlockedCount} property post
                  {propertyBlockedCount === 1 ? '' : 's'} need a permit attached
                  before this campaign can be approved.
                </Alert>
              ) : null}

              {groups.map((group) => (
                <Box key={group.key}>
                  <Text fw={600} size="sm" mb="xs">
                    {group.title}
                  </Text>
                  <Stack gap="sm">
                    {group.posts.map((post) => (
                      <PlanPostCard
                        key={post.id}
                        post={post}
                        sitePublicUrl={detail.sitePublicUrl}
                        projectName={detail.plan.name}
                        blocked={blockedIds.has(post.id)}
                        onSaved={load}
                      />
                    ))}
                  </Stack>
                </Box>
              ))}
            </Stack>
          </ProjectAssetsProvider>
        )}
      </Box>

      {/* footer actions */}
      {detail !== null && detail.posts.length > 0 ? (
        <Group
          justify="space-between"
          wrap="nowrap"
          px="lg"
          py="md"
          style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}
        >
          <Button
            variant="subtle"
            color="gray"
            size="sm"
            onClick={dismiss}
            disabled={approving}
          >
            Dismiss
          </Button>
          <Button
            color="teal"
            size="sm"
            leftSection={<IconCheck size={16} />}
            loading={approving}
            onClick={approve}
          >
            Approve all
          </Button>
        </Group>
      ) : null}
    </Drawer>
  );
};

export default PlanReviewPanel;
