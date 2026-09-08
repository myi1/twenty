// OutcomeSheet.tsx: STUB. Filled in by Task 12 (the post-call outcome sheet:
// disposition, next step, when). Typed against exactly what index.tsx passes so
// the entry compiles now; the real component replaces this whole file.

import type { PropelHeroHost } from '@/propel/runtime/heroHost';
import type { LeadLoad } from './types';

export const OutcomeSheet = (_props: {
  host: PropelHeroHost;
  data: LeadLoad;
  open: boolean;
  callSeconds: number | null;
  phone: boolean;
  onClose: () => void;
  onSaved: () => void;
}) => null;
