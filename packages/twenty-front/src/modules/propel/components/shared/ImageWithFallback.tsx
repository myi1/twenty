import { useEffect, useState, type CSSProperties } from 'react';
import { IconPhoto } from 'twenty-ui/display';

// Reusable <img> with a graceful fallback.
//
// The founder's quality bar ([[ui-plain-language-low-cognitive-load]]): a broken
// or missing image must NEVER render the browser's broken-image glyph. Any
// Marketing-hero <img> whose src can 404 (a library asset whose gateway path
// moved, an expired render URL, a not-yet-uploaded logo) uses this instead of a
// bare <img>: on load error it swaps to a neutral placeholder tile — same box,
// same objectFit footprint — with a small photo icon, so the layout never jumps
// and the surface never shows a broken glyph.
//
// Drop-in: pass the same src / alt / style you'd give an <img>. The placeholder
// inherits width/height/borderRadius from `style` so it occupies the same slot.

export interface ImageWithFallbackProps {
  src: string | undefined | null;
  alt?: string;
  style?: CSSProperties;
  className?: string;
  loading?: 'lazy' | 'eager';
  /** Icon size in px for the placeholder (default 22). */
  fallbackIconSize?: number;
  /** Optional short caption under the placeholder icon (e.g. "No image"). */
  fallbackLabel?: string;
}

export const ImageWithFallback = ({
  src,
  alt = '',
  style,
  className,
  loading = 'lazy',
  fallbackIconSize = 22,
  fallbackLabel,
}: ImageWithFallbackProps) => {
  const trimmed = typeof src === 'string' ? src.trim() : '';
  const [errored, setErrored] = useState(trimmed === '');

  // A fresh src (e.g. a re-generated image) should get another chance to load.
  useEffect(() => {
    setErrored(trimmed === '');
  }, [trimmed]);

  if (errored || trimmed === '') {
    return (
      <div
        className={className}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          width: '100%',
          height: '100%',
          background: 'var(--mantine-color-default-hover)',
          color: 'var(--mantine-color-dimmed)',
          ...style,
        }}
        aria-label={alt || 'No image'}
        role="img"
      >
        <IconPhoto size={fallbackIconSize} />
        {fallbackLabel ? (
          <span style={{ fontSize: 11, lineHeight: 1.2, textAlign: 'center' }}>
            {fallbackLabel}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <img
      src={trimmed}
      alt={alt}
      className={className}
      loading={loading}
      style={style}
      onError={() => setErrored(true)}
    />
  );
};

export default ImageWithFallback;
