import {
  Badge,
  Box,
  Button,
  Group,
  Paper,
  Stack,
  Text,
} from '@mantine/core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  IconBrandInstagram,
  IconRefresh,
} from 'twenty-ui/display';
import { InvitingEmpty, SurfaceIntro } from '@/propel/components/desk';
import { ImageWithFallback } from '@/propel/components/shared/ImageWithFallback';
import { callPropelRoute } from '@/propel/lib/callPropelRoute';

// Competitors sub-tab of Marketing → Social (founder decision 2026-07-11: the
// Competitor Feed's home is the Social area, not a top-level sidebar item).
// Ported from the retired in-sandbox hero (src/shared/competitor-feed-panel.tsx
// in the CRM app repo) — same read route, same role gate, hero-native rendering.
//
// Data: POST /s/marketing/competitor-feed (Manager/Admin; agents get
// { blocked: true } and see the notice below). The route returns absolute
// thumbnail URLs (SITE_PUBLIC_URL /img/is gateway) or null — a null or failing
// image renders the quiet ImageWithFallback placeholder, never a broken glyph.

type FeedRow = {
  id: string;
  accountId: string;
  handle: string;
  displayName: string;
  permalink: string;
  mediaType: string;
  productType: string;
  caption: string;
  thumbnailUrl: string | null;
  likeCount: number | null;
  likesHidden: boolean;
  commentsCount: number;
  engagement: number;
  postedAtLabel: string;
  engagementLabel: string;
};

type FeedResponse =
  | { blocked: true }
  | {
      blocked: false;
      rows: FeedRow[];
      filters: {
        competitors: { id: string; handle: string }[];
        mediaTypes: string[];
      };
      staleness: {
        lastSyncedAt: string | null;
        isStale: boolean;
        hoursAgo: number | null;
      };
      ownBaseline: {
        handle: string;
        displayName: string;
        followersCount: number | null;
      } | null;
      error?: string;
    };

// Format badge: REELS/VIDEO/CAROUSEL/PHOTO in plain words with stable colors
// (mirrors the retired sandbox panel so the founder sees the same vocabulary).
const formatBadge = (
  mediaType: string,
  productType: string,
): { label: string; color: string } => {
  if (productType === 'REELS') return { label: 'Reel', color: 'grape' };
  if (mediaType === 'VIDEO') return { label: 'Video', color: 'violet' };
  if (mediaType === 'CAROUSEL') return { label: 'Carousel', color: 'cyan' };
  if (mediaType === 'IMAGE') return { label: 'Photo', color: 'blue' };
  return { label: mediaType || '—', color: 'gray' };
};

const FilterPill = ({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) => (
  <Button
    size="compact-xs"
    radius="xl"
    variant={active ? 'filled' : 'light'}
    color={active ? 'red' : 'gray'}
    onClick={onClick}
  >
    {label}
  </Button>
);

export const CompetitorsTab = () => {
  const [data, setData] = useState<FeedResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [competitor, setCompetitor] = useState<string>('ALL');
  const [format, setFormat] = useState<string>('ALL');

  const load = useCallback(async () => {
    setIsLoading(true);
    const res = await callPropelRoute<FeedResponse>(
      '/marketing/competitor-feed',
      {},
    );
    setData(res);
    setFailed(res === null);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    if (!data || data.blocked) return [];
    return data.rows.filter(
      (r) =>
        (competitor === 'ALL' || r.handle === competitor) &&
        (format === 'ALL' || r.mediaType === format),
    );
  }, [data, competitor, format]);

  const intro = (
    <SurfaceIntro
      eyebrow="The competitor watch"
      title="What Dubai brokerages are posting — sorted by engagement."
      icon={<IconBrandInstagram size={20} />}
      actions={
        <Button
          size="xs"
          variant="light"
          leftSection={<IconRefresh size={14} />}
          onClick={() => void load()}
          loading={isLoading}
        >
          Refresh
        </Button>
      }
    />
  );

  if (isLoading && data === null) {
    return (
      <Box>
        {intro}
        <Text size="sm" c="dimmed">
          Loading the competitor feed…
        </Text>
      </Box>
    );
  }

  if (failed || data === null) {
    return (
      <Box>
        {intro}
        <InvitingEmpty
          icon={<IconBrandInstagram size={28} />}
          title="The feed didn’t load"
          message="Something went wrong fetching competitor posts. Try refreshing — if it keeps happening, the daily sync may be down."
          cta={
            <Button size="xs" variant="light" onClick={() => void load()}>
              Try again
            </Button>
          }
        />
      </Box>
    );
  }

  if (data.blocked) {
    return (
      <Box>
        {intro}
        <InvitingEmpty
          icon={<IconBrandInstagram size={28} />}
          title="Managers and Admins only"
          message="The competitor watch shows other brokerages’ Instagram activity and is limited to managers and admins."
        />
      </Box>
    );
  }

  return (
    <Box>
      {intro}

      {data.ownBaseline ? (
        <Text size="sm" c="dimmed" mb="xs">
          You (@{data.ownBaseline.handle}):{' '}
          {data.ownBaseline.followersCount ?? '—'} followers
        </Text>
      ) : null}

      {data.staleness.isStale ? (
        <Paper
          withBorder
          radius="md"
          p="xs"
          mb="sm"
          style={{
            borderColor: 'var(--mantine-color-yellow-6)',
            background: 'var(--mantine-color-default-hover)',
          }}
        >
          <Text size="sm">
            ⚠️ This feed may be out of date —{' '}
            {data.staleness.hoursAgo === null
              ? 'it has never synced yet'
              : `last updated ${Math.round(data.staleness.hoursAgo)}h ago`}
            . The daily sync may not be running.
          </Text>
        </Paper>
      ) : null}

      <Group gap={6} mb={6} wrap="wrap">
        <FilterPill
          active={competitor === 'ALL'}
          label="All competitors"
          onClick={() => setCompetitor('ALL')}
        />
        {data.filters.competitors.map((c) => (
          <FilterPill
            key={c.id}
            active={competitor === c.handle}
            label={`@${c.handle}`}
            onClick={() => setCompetitor(c.handle)}
          />
        ))}
      </Group>
      <Group gap={6} mb="md" wrap="wrap">
        <FilterPill
          active={format === 'ALL'}
          label="All formats"
          onClick={() => setFormat('ALL')}
        />
        {data.filters.mediaTypes.map((m) => (
          <FilterPill
            key={m}
            active={format === m}
            label={formatBadge(m, '').label}
            onClick={() => setFormat(m)}
          />
        ))}
      </Group>

      {rows.length === 0 ? (
        <InvitingEmpty
          icon={<IconBrandInstagram size={28} />}
          title="No posts here yet"
          message="The daily sync fills this in — check back after it runs, or widen the filters."
        />
      ) : (
        <Box
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 14,
          }}
        >
          {rows.map((r) => {
            const badge = formatBadge(r.mediaType, r.productType);
            return (
              <Paper
                key={r.id}
                component="a"
                href={r.permalink}
                target="_blank"
                rel="noreferrer"
                withBorder
                radius="md"
                style={{
                  overflow: 'hidden',
                  textDecoration: 'none',
                  color: 'inherit',
                  display: 'block',
                }}
              >
                <Box style={{ aspectRatio: '1 / 1', width: '100%' }}>
                  <ImageWithFallback
                    src={r.thumbnailUrl}
                    alt={`@${r.handle} post`}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                    }}
                    fallbackLabel="No image — open on Instagram"
                  />
                </Box>
                <Stack gap={6} p="sm">
                  <Group justify="space-between" wrap="nowrap" gap={8}>
                    <Text size="sm" fw={600} truncate>
                      @{r.handle}
                    </Text>
                    <Badge size="xs" color={badge.color} variant="light">
                      {badge.label}
                    </Badge>
                  </Group>
                  <Text size="xs" c="dimmed" lineClamp={2}>
                    {r.caption || '—'}
                  </Text>
                  <Group justify="space-between" wrap="nowrap" gap={8}>
                    <Text size="xs" fw={700}>
                      🔥 {r.engagementLabel}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {r.postedAtLabel}
                    </Text>
                  </Group>
                </Stack>
              </Paper>
            );
          })}
        </Box>
      )}
    </Box>
  );
};
