import { callPropelRoute } from '@/propel/lib/callPropelRoute';

// Real data layer for the AI Visibility Monitor (AEO/GEO) on the Website tab's
// "SEO and AI" surface. Replaces the old fake "sample data" preview.
//
// Backend (propel-crm-integration, branch feat/ai-visibility-monitor → develop):
//   POST /marketing/ai-visibility          → the prompts×engines citation board
//   POST /marketing/ai-visibility/track    { prompt }    → add a tracked prompt
//   POST /marketing/ai-visibility/run      { promptId? } → run a check now
// All three are Manager/Admin-gated (identity derived server-side) and query the
// SEARCH-GROUNDED engines (Perplexity / OpenAI web-search / Gemini grounding),
// then detect whether remaxhub.ae is genuinely CITED / MENTIONED / NOT_FOUND and
// which rival portals/brokerages the engines cite instead.
//
// HONESTY: API answers differ from the ChatGPT *app* and vary between runs — this
// is a DIRECTIONAL scoreboard, not gospel. The UI labels it "Beta · directional"
// and always shows the engine + last-checked time so it reads as a snapshot.

export type AiEngine = 'CHATGPT' | 'PERPLEXITY' | 'GEMINI';
export type AiCitationStatus = 'CITED' | 'MENTIONED' | 'NOT_FOUND';

export type AiDetectedRival = {
  domain: string;
  name: string;
  /** true = cited as a source; false = only named in the answer text. */
  cited: boolean;
};

export type AiEngineCell = {
  engine: AiEngine;
  /** false = this engine has never been run for this prompt yet. */
  checked: boolean;
  status: AiCitationStatus | null;
  ourUrl: string | null;
  rivals: AiDetectedRival[];
  checkedAt: string | null;
};

export type AiBoardPrompt = {
  id: string;
  prompt: string;
  isActive: boolean;
  lastCheckedAt: string | null;
  results: AiEngineCell[];
};

export type AiEngineAvailability = {
  engine: AiEngine;
  available: boolean;
  missingEnv?: string;
};

export type AiVisibilityBoard = {
  engines: AiEngineAvailability[];
  prompts: AiBoardPrompt[];
};

type ListRouteBody = {
  ok?: boolean;
  blocked?: boolean;
  engines?: AiEngineAvailability[];
  prompts?: AiBoardPrompt[];
  error?: string;
};

type MutateRouteBody = { ok?: boolean; error?: string; id?: string };

export type FetchBoardResult =
  | { ok: true; board: AiVisibilityBoard }
  | { ok: false; error: string };

const GATED_MSG = 'AI Visibility Monitor is available to managers only.';
const UNREACHABLE_MSG = 'Could not reach the monitor (or you are not signed in).';

/** Load the live prompts×engines board. */
export const fetchAiVisibility = async (): Promise<FetchBoardResult> => {
  const body = await callPropelRoute<ListRouteBody>('/marketing/ai-visibility', {});
  if (body === null) return { ok: false, error: UNREACHABLE_MSG };
  if (body.blocked === true) {
    return { ok: false, error: typeof body.error === 'string' ? body.error : GATED_MSG };
  }
  if (body.ok !== true) {
    return { ok: false, error: typeof body.error === 'string' ? body.error : 'The monitor could not load.' };
  }
  return {
    ok: true,
    board: {
      engines: Array.isArray(body.engines) ? body.engines : [],
      prompts: Array.isArray(body.prompts) ? body.prompts : [],
    },
  };
};

export type MutateResult = { ok: true } | { ok: false; error: string };

/** Track a new buyer prompt. */
export const trackAiPrompt = async (prompt: string): Promise<MutateResult> => {
  const trimmed = prompt.trim();
  if (trimmed === '') return { ok: false, error: 'Enter a prompt to track.' };
  const body = await callPropelRoute<MutateRouteBody>('/marketing/ai-visibility/track', {
    prompt: trimmed,
  });
  if (body === null) return { ok: false, error: UNREACHABLE_MSG };
  if (body.ok !== true) {
    return { ok: false, error: typeof body.error === 'string' ? body.error : 'Could not save the prompt.' };
  }
  return { ok: true };
};

/** Run a check now — one prompt (promptId) or all active prompts (omit it). */
export const runAiCheck = async (promptId?: string): Promise<MutateResult> => {
  const body = await callPropelRoute<MutateRouteBody>(
    '/marketing/ai-visibility/run',
    promptId ? { promptId } : {},
  );
  if (body === null) return { ok: false, error: UNREACHABLE_MSG };
  if (body.ok !== true) {
    return { ok: false, error: typeof body.error === 'string' ? body.error : 'Could not run the check.' };
  }
  return { ok: true };
};

/** "just now" / "3m ago" / "2h ago" / "4d ago" from an ISO timestamp. */
export const relativeCheckAge = (iso: string | null, now: Date = new Date()): string => {
  if (!iso) return 'never';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const mins = Math.max(0, Math.round((now.getTime() - t) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};
