// LeadHeader.tsx: STUB. Filled in by Task 10 (name/avatar, urgency and reply
// signal, quick actions: call, WhatsApp, log outcome). Typed against exactly what
// index.tsx passes so the entry compiles now; the real component replaces this
// whole file.

import type { PropelHeroHost } from '@/propel/runtime/heroHost';
import type { LeadLoad } from './types';

export const LeadHeader = (_props: {
  host: PropelHeroHost;
  data: LeadLoad;
  phone: boolean;
  onLogOutcome: () => void;
  onCallStarted: () => void;
  onChanged: () => void;
  onFocusComposer: () => void;
}) => null;
