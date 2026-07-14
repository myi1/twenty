import { Box, Button, Group, Text, useComputedColorScheme } from '@mantine/core';
import { keyframes } from '@emotion/react';
import styled from '@emotion/styled';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  IconBrandInstagram,
  IconHeart,
  IconMessage,
  IconPlayerPlay,
  IconRefresh,
} from 'twenty-ui/display';
import { InvitingEmpty, SurfaceIntro } from '@/propel/components/desk';
import { ImageWithFallback } from '@/propel/components/shared/ImageWithFallback';
import { ManageCompetitorsDrawer } from '@/propel/components/marketingHero/ManageCompetitorsDrawer';
import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import { DUR, EASE, staggerDelay } from '~/heroes/_pulse/motion';
import { FONT_MONO, PulseFonts, PulseScope } from '~/heroes/_pulse/pulse';

// Competitors sub-tab of Marketing → Social (founder decision 2026-07-11: the
// Competitor Feed's home is the Social area, not a top-level sidebar item).
// Ported from the retired in-sandbox hero (src/shared/competitor-feed-panel.tsx
// in the CRM app repo) — same read route, same role gate, hero-native rendering.
//
// Presentation (founder feedback 2026-07-11): this reads like an INSTAGRAM FEED,
// not a data grid — media-first cards (the image IS the card), an account header
// row (avatar · @handle · post age), an engagement row under the media, caption
// below like IG. Nocturne register via the _pulse tokens (PulseScope declares the
// --p-* ledger; light/dark follows the CRM scheme). Masonry columns on wide,
// a single column on narrow — a feed, not a table.
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

// Sort options (founder-approved 2026-07-12). Mirrors FeedSort in the CRM
// repo's competitor-feed-view.ts — 'engagement' is the existing default.
type FeedSort = 'engagement' | 'recent' | 'likes' | 'comments';

const SORT_OPTIONS: { value: FeedSort; label: string }[] = [
  { value: 'engagement', label: 'Most engagement' },
  { value: 'recent', label: 'Most recent' },
  { value: 'likes', label: 'Most liked' },
  { value: 'comments', label: 'Most commented' },
];

// Plain-language phrase for the intro copy — no raw sort value shown to the user.
const SORT_INTRO_PHRASE: Record<FeedSort, string> = {
  engagement: 'sorted by engagement',
  recent: 'sorted by most recent',
  likes: 'sorted by most liked',
  comments: 'sorted by most commented',
};

type FeedResponse =
  | { blocked: true }
  | {
      blocked: false;
      rows: FeedRow[];
      // Paging meta: the route slices its response under the fork engine's
      // ~64KB executor cliff (a bigger body silently arrives as 0 bytes), so
      // the tab follows nextOffset until hasMore is false.
      total?: number;
      nextOffset?: number | null;
      hasMore?: boolean;
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

// Page size the route defaults to; requested explicitly so the loop below and
// the server agree. 80 rows ≈ 45KB — safely under the 64KB cliff.
const PAGE_LIMIT = 80;
// Hard stop so a confused server can never loop us forever (~15×120 rows).
const MAX_PAGES = 15;
// A stalled request (seen on staging: a fetch that never settles) must degrade
// to the Try-again state, never an endless spinner — and must ABORT so the
// zombie request frees its socket (a merely-raced stall keeps holding one of
// Chrome's 6 per-host connections and starves every other tab).
const CALL_TIMEOUT_MS = 20_000;

const callFeedPage = (body: object): Promise<FeedResponse | null> =>
  callPropelRoute<FeedResponse>('/marketing/competitor-feed', body, {
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
  });

// Format label in plain words (Nocturne accent discipline: the chip is a quiet
// hairline chip, never a colored badge — brass is the only accent).
const formatLabel = (mediaType: string, productType: string): string => {
  if (productType === 'REELS') return 'Reel';
  if (mediaType === 'VIDEO') return 'Video';
  if (mediaType === 'CAROUSEL') return 'Carousel';
  if (mediaType === 'IMAGE') return 'Photo';
  return mediaType ? mediaType.charAt(0) + mediaType.slice(1).toLowerCase() : '';
};

const isVideoish = (mediaType: string, productType: string): boolean =>
  productType === 'REELS' || mediaType === 'VIDEO';

// Compact counts the way a social feed shows them: 843 · 1,204 · 12.4k · 1.2M.
const compactCount = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return n.toLocaleString('en-US');
};

// IG-style post age ("3h", "2d", "5w") derived from the server's Dubai-time
// label ("Jul 8, 3:12 PM" — the route doesn't ship the raw timestamp). The
// label has no year, so pick the most recent occurrence not in the future.
// If the shape ever changes, fall back to showing the label itself.
const MONTH_IDX: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

const postAge = (label: string, nowMs: number): string => {
  const m = label.match(/^([A-Z][a-z]{2}) (\d{1,2}), (\d{1,2}):(\d{2}) (AM|PM)$/);
  if (!m) return label;
  const mon = MONTH_IDX[m[1]];
  if (mon === undefined) return label;
  const day = Number(m[2]);
  let hour = Number(m[3]) % 12;
  if (m[5] === 'PM') hour += 12;
  const minute = Number(m[4]);
  // The label is Dubai wall time (UTC+4, no DST): UTC instant = wall − 4h.
  const dubaiYear = new Date(nowMs + 4 * 3_600_000).getUTCFullYear();
  let t = Date.UTC(dubaiYear, mon, day, hour, minute) - 4 * 3_600_000;
  if (t > nowMs + 60_000) {
    t = Date.UTC(dubaiYear - 1, mon, day, hour, minute) - 4 * 3_600_000;
  }
  const mins = Math.max(1, Math.floor((nowMs - t) / 60_000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 9) return `${weeks}w`;
  return `${m[1]} ${day}`;
};

// ── Feed styling (Nocturne, instrument register — _pulse tokens) ─────────────

// Card entry: fade + small rise, ease-out, staggered. Never from scale(0);
// reduced motion keeps the fade and drops the transform.
const cardIn = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
`;
const cardInReduced = keyframes`
  from { opacity: 0; }
  to   { opacity: 1; }
`;

// Masonry feel: single-column scroll on narrow, 2–3 columns on wide.
// CSS multi-columns would fill COLUMN-major (rank #159 lands at the top of
// column 2), which breaks the "sorted by <current sort>" promise — so the live
// feed distributes cards round-robin into flex columns (row-major reading
// order) via useFeedColumnCount below. The CSS-columns Masonry stays only
// for the loading skeleton, where order is meaningless.
//
// This distribution never inspects WHAT the rows are sorted by — it just
// preserves whatever order `rows` arrives in — so the same row-major logic
// holds for all four sort modes (engagement/recent/likes/comments), not
// just the original engagement default.
const Masonry = styled.div`
  column-count: 1;
  column-gap: 16px;
  @media (min-width: 720px) {
    column-count: 2;
  }
  @media (min-width: 1160px) {
    column-count: 3;
  }
`;

const FeedColumns = styled.div`
  display: flex;
  gap: 16px;
  align-items: flex-start;
`;

const FeedColumn = styled.div`
  flex: 1;
  min-width: 0;
`;

const columnCountForWidth = (w: number): number =>
  w >= 1160 ? 3 : w >= 720 ? 2 : 1;

const useFeedColumnCount = (): number => {
  const [count, setCount] = useState(() =>
    columnCountForWidth(window.innerWidth),
  );
  useEffect(() => {
    const onResize = () => setCount(columnCountForWidth(window.innerWidth));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return count;
};

const PostCard = styled.a`
  display: block;
  break-inside: avoid;
  margin-bottom: 16px;
  background: var(--p-surface);
  border: 1px solid var(--p-line);
  border-radius: var(--p-radius);
  overflow: hidden;
  text-decoration: none;
  color: var(--p-ink);
  cursor: pointer;
  animation: ${cardIn} 240ms var(--ease-out) backwards;
  transition:
    transform ${DUR.press}ms ${EASE.out},
    border-color ${DUR.tooltip}ms ${EASE.out};
  @media (hover: hover) and (pointer: fine) {
    &:hover {
      transform: translateY(-1px);
      border-color: color-mix(in srgb, var(--p-accent) 35%, var(--p-line));
    }
  }
  &:active {
    transform: scale(0.97);
  }
  &:focus-visible {
    outline: none;
    box-shadow: var(--p-focus-ring);
  }
  @media (prefers-reduced-motion: reduce) {
    animation-name: ${cardInReduced};
    &:hover,
    &:active {
      transform: none;
    }
  }
`;

const CardHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 10px 12px;
  min-width: 0;
`;

const Avatar = styled.span`
  width: 28px;
  height: 28px;
  border-radius: var(--p-radius-pill);
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--avatar-bg);
  border: 1px solid var(--p-line);
  color: var(--p-accent);
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
`;

const Handle = styled.span`
  font-size: 13px;
  font-weight: 600;
  color: var(--p-ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
`;

const Age = styled.span`
  font-size: 12px;
  color: var(--p-ink-2);
  white-space: nowrap;
  flex: none;
`;

const FormatChip = styled.span`
  margin-left: auto;
  flex: none;
  font-size: 11px;
  font-weight: 500;
  color: var(--p-ink-2);
  border: 1px solid var(--p-line);
  border-radius: var(--p-radius-pill);
  padding: 2px 9px;
  line-height: 1.4;
`;

const MediaBox = styled.div<{ $portrait: boolean }>`
  position: relative;
  width: 100%;
  aspect-ratio: ${({ $portrait }) => ($portrait ? '4 / 5' : '1 / 1')};
  background: var(--p-surface-2);
`;

const PlayGlyph = styled.span`
  position: absolute;
  top: 10px;
  right: 10px;
  width: 26px;
  height: 26px;
  border-radius: var(--p-radius-pill);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--p-scrim);
  color: #f4eee0;
  pointer-events: none;
`;

const EngagementRow = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 12px 0;
  color: var(--p-ink-2);
`;

const Metric = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-family: ${FONT_MONO};
  font-size: 12px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  color: var(--p-ink-2);
`;

// The engagement seal — always shows the post's likes+comments count as a
// reference stat, regardless of which sort is active (it is only the actual
// "rank" signal when sort === 'engagement'; under the other three sorts it's
// just informational, same as the like/comment counts beside it). Quiet by
// design: mono figure, hairline pill, no fill.
const RankSeal = styled.span`
  margin-left: auto;
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-family: ${FONT_MONO};
  font-size: 11px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  color: var(--p-ink-2);
  border: 1px solid var(--p-line);
  border-radius: var(--p-radius-pill);
  padding: 2px 9px;
  line-height: 1.5;
`;

const Caption = styled.div`
  padding: 7px 12px 12px;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--p-ink-2);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const Pill = styled.button<{ $active: boolean }>`
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.5;
  padding: 4px 12px;
  border-radius: var(--p-radius-pill);
  cursor: pointer;
  background: ${({ $active }) => ($active ? 'var(--p-accent-tint)' : 'transparent')};
  border: 1px solid ${({ $active }) => ($active ? 'var(--p-accent)' : 'var(--p-line)')};
  color: ${({ $active }) => ($active ? 'var(--p-ink)' : 'var(--p-ink-2)')};
  transition:
    transform ${DUR.press}ms ${EASE.out},
    color ${DUR.tooltip}ms ${EASE.out},
    border-color ${DUR.tooltip}ms ${EASE.out},
    background ${DUR.tooltip}ms ${EASE.out};
  @media (hover: hover) and (pointer: fine) {
    &:hover {
      color: var(--p-ink);
      border-color: color-mix(in srgb, var(--p-accent) 45%, var(--p-line));
    }
  }
  &:active {
    transform: scale(0.97);
  }
  &:focus-visible {
    outline: none;
    box-shadow: var(--p-focus-ring);
  }
  @media (prefers-reduced-motion: reduce) {
    &:active {
      transform: none;
    }
  }
`;

const PillRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
`;

const BaselineLine = styled.div`
  font-size: 12.5px;
  color: var(--p-ink-2);
  margin-bottom: 10px;
`;

const StaleNotice = styled.div`
  display: flex;
  align-items: center;
  gap: 9px;
  border: 1px solid var(--p-line);
  border-radius: var(--p-radius-sm);
  background: var(--p-surface);
  padding: 8px 12px;
  margin-bottom: 12px;
  font-size: 12.5px;
  color: var(--p-ink-2);
`;

const WarnDot = styled.span`
  width: 7px;
  height: 7px;
  border-radius: var(--p-radius-pill);
  flex: none;
  background: var(--p-warn);
  box-shadow: 0 0 0 3px var(--seal-ring);
`;

// Loading = a calm pulse (opacity only), shaped like the feed it becomes.
const calmPulse = keyframes`
  from { opacity: 0.45; }
  to   { opacity: 1; }
`;

const SkeletonCard = styled.div<{ $portrait: boolean }>`
  break-inside: avoid;
  margin-bottom: 16px;
  border: 1px solid var(--p-line);
  border-radius: var(--p-radius);
  overflow: hidden;
  background: var(--p-surface);
  animation: ${calmPulse} 1.1s ${EASE.inOut} infinite alternate;
  &::before {
    content: '';
    display: block;
    height: 48px;
  }
  &::after {
    content: '';
    display: block;
    width: 100%;
    aspect-ratio: ${({ $portrait }) => ($portrait ? '4 / 5' : '1 / 1')};
    background: var(--p-surface-2);
  }
`;

export const CompetitorsTab = () => {
  const [data, setData] = useState<FeedResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [competitor, setCompetitor] = useState<string>('ALL');
  const [format, setFormat] = useState<string>('ALL');
  const [sort, setSort] = useState<FeedSort>('engagement');
  const colorScheme = useComputedColorScheme('dark');

  const [manageOpen, setManageOpen] = useState(false);
  const [syncProgress, setSyncProgress] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    const first = await callFeedPage({ offset: 0, limit: PAGE_LIMIT, sort });
    if (first === null || first.blocked) {
      setData(first);
      setFailed(first === null);
      setIsLoading(false);
      return;
    }
    // Follow the pages (see FeedResponse paging note). A mid-loop failure
    // keeps what we have rather than discarding the loaded rows. Sort is
    // applied server-side before paging, so every page stays contiguous
    // under the requested sort.
    let rows = [...first.rows];
    let next = first.nextOffset ?? null;
    let pages = 1;
    while (next !== null && pages < MAX_PAGES) {
      const page = await callFeedPage({ offset: next, limit: PAGE_LIMIT, sort });
      if (page === null || page.blocked) break;
      rows = rows.concat(page.rows);
      next = page.nextOffset ?? null;
      pages += 1;
    }
    setData({ ...first, rows });
    setFailed(false);
    setIsLoading(false);
  }, [sort]);

  // Sync now: loop the tracked accounts one at a time (each call stays under the
  // hero's 20s fetch timeout; a full pull runs minutes). Honest progress; a
  // per-account failure is counted and the loop continues.
  const syncNow = useCallback(async () => {
    const listRes = await callPropelRoute<{ rows?: { id: string; name: string; isActive: boolean | null }[] }>(
      '/marketing/competitor-manage',
      { action: 'list' },
    );
    const active = (listRes?.rows ?? []).filter((r) => r.isActive !== false);
    if (active.length === 0) {
      setSyncProgress(null);
      return;
    }
    let done = 0;
    let problems = 0;
    for (const acct of active) {
      setSyncProgress(`Syncing… ${done + 1} of ${active.length}`);
      const r = await callPropelRoute<{ ok?: boolean }>('/marketing/competitor-sync', { accountId: acct.id });
      if (!r?.ok) problems += 1;
      done += 1;
    }
    setSyncProgress(problems > 0 ? `Synced ${done - problems} of ${done}, ${problems} had problems` : null);
    await load();
    // clear the final message after a short beat
    window.setTimeout(() => setSyncProgress(null), 4000);
  }, [load]);

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

  const nowMs = useMemo(() => Date.now(), [data]);

  // Row-major masonry: card i lives in column i % n, so the engagement
  // ranking reads left-to-right across the visual rows.
  const columnCount = useFeedColumnCount();
  const columns = useMemo(() => {
    const cols: { row: FeedRow; index: number }[][] = Array.from(
      { length: columnCount },
      () => [],
    );
    rows.forEach((row, index) => {
      cols[index % columnCount].push({ row, index });
    });
    return cols;
  }, [rows, columnCount]);

  const intro = (
    <SurfaceIntro
      eyebrow="The competitor watch"
      title={`What Dubai brokerages are posting — ${SORT_INTRO_PHRASE[sort]}.`}
      icon={<IconBrandInstagram size={20} />}
      actions={
        <Group gap="xs">
          {syncProgress ? <Text size="xs" c="dimmed">{syncProgress}</Text> : null}
          <Button size="xs" variant="subtle" onClick={() => setManageOpen(true)}>
            Manage competitors
          </Button>
          <Button
            size="xs"
            variant="light"
            leftSection={<IconRefresh size={14} />}
            onClick={() => void syncNow()}
            loading={syncProgress !== null}
          >
            Sync now
          </Button>
        </Group>
      }
    />
  );

  if (isLoading && data === null) {
    return (
      <Box>
        {intro}
        <PulseFonts />
        <PulseScope $light={colorScheme === 'light'}>
          <Masonry aria-label="Loading the competitor feed">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <SkeletonCard key={i} $portrait={i % 2 === 0} />
            ))}
          </Masonry>
        </PulseScope>
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
      <PulseFonts />
      <PulseScope $light={colorScheme === 'light'}>
        {data.ownBaseline ? (
          <BaselineLine>
            You (@{data.ownBaseline.handle})
            {data.ownBaseline.followersCount !== null
              ? ` · ${compactCount(data.ownBaseline.followersCount)} followers`
              : ''}
          </BaselineLine>
        ) : null}

        {data.staleness.isStale ? (
          <StaleNotice>
            <WarnDot />
            <span>
              This feed may be out of date —{' '}
              {data.staleness.hoursAgo === null
                ? 'it has never synced yet'
                : `last updated ${Math.round(data.staleness.hoursAgo)}h ago`}
              . The daily sync may not be running.
            </span>
          </StaleNotice>
        ) : null}

        <PillRow>
          {SORT_OPTIONS.map((opt) => (
            <Pill
              key={opt.value}
              $active={sort === opt.value}
              onClick={() => setSort(opt.value)}
            >
              {opt.label}
            </Pill>
          ))}
        </PillRow>
        <PillRow>
          <Pill
            $active={competitor === 'ALL'}
            onClick={() => setCompetitor('ALL')}
          >
            All competitors
          </Pill>
          {data.filters.competitors.map((c) => (
            <Pill
              key={c.id}
              $active={competitor === c.handle}
              onClick={() => setCompetitor(c.handle)}
            >
              @{c.handle}
            </Pill>
          ))}
        </PillRow>
        <PillRow style={{ marginBottom: 16 }}>
          <Pill $active={format === 'ALL'} onClick={() => setFormat('ALL')}>
            All formats
          </Pill>
          {data.filters.mediaTypes.map((m) => (
            <Pill
              key={m}
              $active={format === m}
              onClick={() => setFormat(m)}
            >
              {formatLabel(m, '')}
            </Pill>
          ))}
        </PillRow>

        {rows.length === 0 ? (
          <InvitingEmpty
            icon={<IconBrandInstagram size={28} />}
            title="No posts here yet"
            message="The daily sync fills this in — check back after it runs, or widen the filters."
          />
        ) : (
          <FeedColumns>
            {columns.map((col, colIdx) => (
              <FeedColumn key={colIdx}>
                {col.map(({ row: r, index: i }) => {
                  const portrait = isVideoish(r.mediaType, r.productType);
                  const age = postAge(r.postedAtLabel, nowMs);
                  return (
                <PostCard
                  key={r.id}
                  href={r.permalink}
                  target="_blank"
                  rel="noreferrer"
                  style={{ animationDelay: `${staggerDelay(i)}ms` }}
                  aria-label={`Open @${r.handle}’s post on Instagram`}
                >
                  <CardHeader>
                    <Avatar title={r.displayName} aria-hidden>
                      {(r.handle || '?').charAt(0)}
                    </Avatar>
                    <Handle>@{r.handle}</Handle>
                    {age ? (
                      <Age title={r.postedAtLabel}>· {age}</Age>
                    ) : null}
                    <FormatChip>
                      {formatLabel(r.mediaType, r.productType)}
                    </FormatChip>
                  </CardHeader>
                  <MediaBox $portrait={portrait}>
                    <ImageWithFallback
                      src={r.thumbnailUrl}
                      alt={`@${r.handle} post`}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        display: 'block',
                        background: 'var(--p-surface-2)',
                      }}
                      fallbackLabel="No image — open on Instagram"
                    />
                    {isVideoish(r.mediaType, r.productType) ? (
                      <PlayGlyph>
                        <IconPlayerPlay size={13} />
                      </PlayGlyph>
                    ) : null}
                  </MediaBox>
                  <EngagementRow>
                    {!r.likesHidden && r.likeCount !== null ? (
                      <Metric title="Likes">
                        <IconHeart size={15} />
                        {compactCount(r.likeCount)}
                      </Metric>
                    ) : (
                      <Metric title="This account hides its like counts">
                        <IconHeart size={15} />
                        Hidden
                      </Metric>
                    )}
                    <Metric title="Comments">
                      <IconMessage size={15} />
                      {compactCount(r.commentsCount)}
                    </Metric>
                    <RankSeal
                      title={
                        r.likesHidden
                          ? 'Engagement rank (comments only — likes hidden)'
                          : 'Engagement rank (likes + comments)'
                      }
                    >
                      🔥 {compactCount(r.engagement)}
                    </RankSeal>
                  </EngagementRow>
                  {r.caption ? <Caption>{r.caption}</Caption> : null}
                </PostCard>
                  );
                })}
              </FeedColumn>
            ))}
          </FeedColumns>
        )}
      </PulseScope>
      <ManageCompetitorsDrawer
        opened={manageOpen}
        onClose={() => setManageOpen(false)}
        onChanged={() => void load()}
      />
    </Box>
  );
};
