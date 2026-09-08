// Story.tsx: STUB. Filled in by Task 11 (the timeline + the WhatsApp composer, in
// StoryComposer.tsx). Typed against exactly what index.tsx passes so the entry
// compiles now; the real component replaces this whole file.

import type { PropelHeroHost } from '@/propel/runtime/heroHost';
import type { LeadLoad } from './types';

export const Story = (_props: {
  host: PropelHeroHost;
  data: LeadLoad;
  reloadToken: number;
  onChanged: () => void;
}) => null;
