import { useEffect, useState } from 'react';
import { Box, Image } from '@mantine/core';

// Off-Plan brand palette (Nocturne). Kept local so the placeholder reads as
// "RE/MAX property" rather than a generic grey skeleton.
const NAVY_DEEP = '#16273f';
const NAVY_MID = '#2a4368';
const BRASS = '#d4af37';

/**
 * A project render with a tasteful branded fallback — never a broken-image icon.
 *
 * Two failure modes are covered:
 *   1. `src` is null/empty (project has no primary render) → placeholder.
 *   2. `src` is present but fails to load (rotated/removed vendor URL) →
 *      `onError` flips to the placeholder.
 *
 * The placeholder is a deep-navy gradient with a low-opacity brass skyline —
 * on-brand, calm, and clearly "a building we don't have a photo of yet".
 */
export function OffplanHeroImage({
  src,
  h,
  w,
  radius = 'sm',
  alt,
}: {
  src?: string | null;
  h: number | string;
  w?: number | string;
  radius?: string | number;
  alt?: string;
}) {
  const [failed, setFailed] = useState(false);

  // Reset the error latch when the source changes (drawer re-used across projects).
  useEffect(() => {
    setFailed(false);
  }, [src]);

  // Only render values that are absolute URLs. Upstream historically returned a
  // bare B2 object key ("geniemap/images/<hash>.webp") which the browser resolves
  // against its own origin and 404s — the "broken image in every drawer" bug.
  // Guarding here means an un-migrated backend degrades to the branded placeholder
  // instead of a broken-image icon.
  const isRenderable = !!src && /^(https?:)?\/\//i.test(src);
  const showImage = isRenderable && !failed;
  const width = w ?? '100%';

  if (showImage) {
    return (
      <Image
        src={src as string}
        h={h}
        w={width}
        radius={radius}
        fit="cover"
        alt={alt}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <Box
      h={h}
      w={width}
      role="img"
      aria-label={alt ?? 'No image available'}
      style={{
        flex: 'none',
        borderRadius: typeof radius === 'number' ? radius : 8,
        background: `linear-gradient(135deg, ${NAVY_MID} 0%, ${NAVY_DEEP} 100%)`,
        display: 'grid',
        placeItems: 'center',
        overflow: 'hidden',
      }}
    >
      <svg
        width="52%"
        height="52%"
        viewBox="0 0 120 60"
        fill="none"
        style={{ opacity: 0.32 }}
        preserveAspectRatio="xMidYMax meet"
      >
        <g fill={BRASS}>
          <rect x="14" y="26" width="16" height="34" rx="1" />
          <rect x="34" y="14" width="18" height="46" rx="1" />
          <rect x="56" y="4" width="14" height="56" rx="1" />
          <rect x="74" y="20" width="16" height="40" rx="1" />
          <rect x="94" y="30" width="14" height="30" rx="1" />
        </g>
        <g fill={NAVY_DEEP} opacity="0.55">
          <rect x="60" y="12" width="6" height="8" />
          <rect x="60" y="26" width="6" height="8" />
          <rect x="60" y="40" width="6" height="8" />
          <rect x="38" y="22" width="10" height="6" />
          <rect x="38" y="34" width="10" height="6" />
          <rect x="78" y="28" width="8" height="6" />
        </g>
      </svg>
    </Box>
  );
}
