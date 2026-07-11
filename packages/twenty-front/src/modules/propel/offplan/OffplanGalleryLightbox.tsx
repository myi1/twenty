import { useCallback, useEffect, useRef } from 'react';
import { Box, Portal } from '@mantine/core';
import { OffplanHeroImage } from './OffplanHeroImage';

// Full-screen render browser for the project drawer. Large image + prev/next +
// keyboard (← → Esc) + touch swipe + click-backdrop-to-close. Uses
// OffplanHeroImage so a rotated/dead vendor URL degrades to the branded
// placeholder — never a broken-image icon.
//
// Motion follows the house animation standard: short (~180ms) ease-out fades,
// no scale(0) pop. The overlay sits above the Mantine Drawer (z-index 10000).
const BRASS = '#d4af37';
const SWIPE_THRESHOLD_PX = 48;

export function OffplanGalleryLightbox({
  images,
  index,
  alt,
  onIndex,
  onClose,
}: {
  images: string[];
  index: number;
  alt?: string;
  onIndex: (next: number) => void;
  onClose: () => void;
}) {
  const count = images.length;
  const touchX = useRef<number | null>(null);

  const go = useCallback(
    (delta: number) => {
      if (count === 0) return;
      onIndex((index + delta + count) % count);
    },
    [count, index, onIndex],
  );

  // Keyboard: arrows navigate, Esc closes. Bound at document level so it works
  // regardless of focus (the overlay itself holds no focusable-by-default node).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [go, onClose]);

  if (count === 0) return null;
  const src = images[Math.max(0, Math.min(index, count - 1))];

  return (
    <Portal>
    <Box
      role="dialog"
      aria-modal
      aria-label={alt ? `${alt} — image ${index + 1} of ${count}` : `Image ${index + 1} of ${count}`}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(6,10,18,.92)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        animation: 'opFadeIn 180ms ease-out',
      }}
    >
      <style>{`@keyframes opFadeIn{from{opacity:0}to{opacity:1}}`}</style>

      {/* Close */}
      <button
        type="button"
        aria-label="Close"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        style={{ ...btn, position: 'absolute', top: 16, right: 16, width: 40, height: 40, fontSize: 22 }}
      >×</button>

      {/* Counter */}
      <Box style={{ position: 'absolute', top: 20, left: 20, color: '#dfe6f2', font: '600 13px system-ui', letterSpacing: .5 }}>
        {index + 1} / {count}
      </Box>

      {/* Prev */}
      {count > 1 && (
        <button
          type="button" aria-label="Previous image"
          onClick={(e) => { e.stopPropagation(); go(-1); }}
          style={{ ...btn, position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', width: 46, height: 46, fontSize: 24 }}
        >‹</button>
      )}

      {/* Stage — stop propagation so a click on the image doesn't close */}
      <Box
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => { touchX.current = e.touches[0]?.clientX ?? null; }}
        onTouchEnd={(e) => {
          const start = touchX.current; touchX.current = null;
          const end = e.changedTouches[0]?.clientX;
          if (start == null || end == null) return;
          const dx = end - start;
          if (Math.abs(dx) > SWIPE_THRESHOLD_PX) go(dx < 0 ? 1 : -1);
        }}
        style={{ width: 'min(92vw, 1200px)', height: '82vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        {/* keyed so the fade re-triggers on each navigation */}
        <Box key={`${src}-${index}`} style={{ width: '100%', height: '100%', animation: 'opFadeIn 160ms ease-out' }}>
          <OffplanHeroImage src={src} h="100%" w="100%" radius={10} alt={alt} />
        </Box>
      </Box>

      {/* Next */}
      {count > 1 && (
        <button
          type="button" aria-label="Next image"
          onClick={(e) => { e.stopPropagation(); go(1); }}
          style={{ ...btn, position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', width: 46, height: 46, fontSize: 24 }}
        >›</button>
      )}

      {/* Thumbnail strip */}
      {count > 1 && (
        <Box
          onClick={(e) => e.stopPropagation()}
          style={{ position: 'absolute', bottom: 14, display: 'flex', gap: 8, padding: '0 16px', maxWidth: '94vw', overflowX: 'auto' }}
        >
          {images.map((g, i) => (
            <Box
              key={`${g}-${i}`}
              onClick={() => onIndex(i)}
              style={{
                flex: 'none', cursor: 'pointer', borderRadius: 6, overflow: 'hidden',
                outline: i === index ? `2px solid ${BRASS}` : '2px solid transparent',
                opacity: i === index ? 1 : 0.6, transition: 'opacity 160ms ease-out, outline-color 160ms ease-out',
              }}
            >
              <OffplanHeroImage src={g} w={64} h={44} radius={6} alt={`thumbnail ${i + 1}`} />
            </Box>
          ))}
        </Box>
      )}
    </Box>
    </Portal>
  );
}

const btn: React.CSSProperties = {
  display: 'grid', placeItems: 'center',
  background: 'rgba(20,30,48,.72)', color: '#fff',
  border: '1px solid rgba(255,255,255,.18)', borderRadius: '50%',
  cursor: 'pointer', lineHeight: 1,
  transition: 'background 160ms ease-out',
};
