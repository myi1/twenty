import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import { friendlyError } from '@/propel/lib/friendlyError';

// Data layer for social Style-Learning — the "learn from our real post history"
// seam behind the Social Bench's campaign box. ONE Manager/Admin-gated CRM route
// (propel-crm-integration, LIVE on staging):
//
//   POST /s/marketing/social-style  body { action }   (FLAT body — the gotcha)
//     action:'refresh' → recompute the Style Profile from the latest Meta + own
//                        posts (distill), then return it
//     action:'get'     → the cached Style Profile
//       either →
//         { ok, profile:{ perPlatform:{ [FACEBOOK|INSTAGRAM]:
//                           { voice, whatWorks[], whatFlops[] } },
//                         generatedAt, sampleSize } }
//         (cold-start = ok:true with an empty perPlatform / sampleSize 0)
//       → { ok:false, code:'FEATURE_OFF' }        (no LLM key / no Meta token)
//       → { ok:false, error:'unknown action …' }  (route predates this action)
//
// callPropelRoute sends the CRM session token; identity + role are derived
// server-side and the route fails CLOSED (NOT_FOUND) for a non-Manager. It returns
// the parsed 2xx body, or null (non-2xx / network / not signed in / route not
// deployed). A gated/bad-input envelope answers 200 with { ok:false, code }, so we
// narrow on body shape and hand callers a discriminated result.
//
// Graceful degrade: `unavailable` = style-learning isn't live on this workspace
// (route missing → null body, FEATURE_OFF, or an older route answering "unknown
// action"). The panel HIDES the whole note in that case — never a toast. A
// cold-start (ok:true, sampleSize 0) is NOT unavailable: the note still shows the
// honest "not enough history yet" line.

const ROUTE = '/marketing/social-style';

type Envelope = { ok?: boolean; error?: string; code?: string } & Record<
  string,
  unknown
>;

// Only FACEBOOK/INSTAGRAM carry style profiles (the Meta organic-insight sources).
export type StylePlatform = 'FACEBOOK' | 'INSTAGRAM';

const STYLE_PLATFORMS: readonly StylePlatform[] = ['FACEBOOK', 'INSTAGRAM'];

// One platform's distilled voice: the house voice line + a few "keep doing this"
// and "avoid this" bullets the bench leans on.
export interface PlatformStyle {
  voice: string;
  whatWorks: string[];
  whatFlops: string[];
}

// The cached Style Profile. `perPlatform` carries only the platforms that have a
// profile (may be a subset — e.g. INSTAGRAM only, the current live state).
// `sampleSize` 0 (or an empty perPlatform) is the cold-start tell.
export interface StyleProfile {
  perPlatform: Partial<Record<StylePlatform, PlatformStyle>>;
  generatedAt: string | null;
  sampleSize: number;
}

const failMessage = (body: Envelope | null): string => {
  if (body === null) {
    return 'Could not reach style-learning (sign in as a Manager; the feature may not be deployed yet).';
  }
  return typeof body.error === 'string' && body.error
    ? friendlyError(body.error, 'generic')
    : 'Request failed.';
};

// Route missing (null), FEATURE_OFF, or a pre-style route answering "unknown
// action" — all mean "style-learning isn't live here", so the note hides.
const isUnavailable = (body: Envelope | null): boolean => {
  if (body === null) return true;
  if (body.ok === false && body.code === 'FEATURE_OFF') return true;
  return (
    typeof body.error === 'string' &&
    body.error.toLowerCase().includes('unknown action')
  );
};

const asStr = (v: unknown): string => (typeof v === 'string' ? v : '');

const asStrArr = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string' && x !== '')
    : [];

// Tolerant per-platform parse: keep the platform only if it carries something
// meaningful (a voice line or at least one bullet) — an all-empty platform block
// is treated as "no profile for this platform", not a broken one.
const parsePlatformStyle = (raw: unknown): PlatformStyle | null => {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const voice = asStr(r.voice);
  const whatWorks = asStrArr(r.whatWorks);
  const whatFlops = asStrArr(r.whatFlops);
  if (voice === '' && whatWorks.length === 0 && whatFlops.length === 0) {
    return null;
  }
  return { voice, whatWorks, whatFlops };
};

const parseProfile = (raw: unknown): StyleProfile => {
  const r =
    raw !== null && typeof raw === 'object'
      ? (raw as Record<string, unknown>)
      : {};
  const perPlatformRaw =
    r.perPlatform !== null && typeof r.perPlatform === 'object'
      ? (r.perPlatform as Record<string, unknown>)
      : {};
  const perPlatform: Partial<Record<StylePlatform, PlatformStyle>> = {};
  for (const platform of STYLE_PLATFORMS) {
    const ps = parsePlatformStyle(perPlatformRaw[platform]);
    if (ps !== null) perPlatform[platform] = ps;
  }
  return {
    perPlatform,
    generatedAt:
      typeof r.generatedAt === 'string' && r.generatedAt !== ''
        ? r.generatedAt
        : null,
    sampleSize:
      typeof r.sampleSize === 'number' && Number.isFinite(r.sampleSize)
        ? r.sampleSize
        : 0,
  };
};

// A cold-start profile carries no per-platform blocks and/or no observed posts.
// The note renders the honest "not enough history yet" line rather than a voice.
export const isColdStart = (profile: StyleProfile): boolean =>
  profile.sampleSize <= 0 || Object.keys(profile.perPlatform).length === 0;

// Discriminated result: on success the caller renders the note (cold-start or a
// real profile); `unavailable` hides the whole note (transient/route-missing).
export type StyleResult =
  | { ok: true; profile: StyleProfile }
  | { ok: false; unavailable: boolean; error: string };

const callStyle = async (action: 'get' | 'refresh'): Promise<StyleResult> => {
  // FLAT body — the route reads event.body.action directly.
  const body = await callPropelRoute<Envelope>(ROUTE, { action });
  if (body && body.ok === true) {
    return { ok: true, profile: parseProfile(body.profile) };
  }
  return {
    ok: false,
    unavailable: isUnavailable(body),
    error: failMessage(body),
  };
};

// getStyle — the cached profile (best-effort on mount). unavailable → hide.
export const getStyle = (): Promise<StyleResult> => callStyle('get');

// refreshStyle — recompute from the latest posts, then return the fresh profile.
export const refreshStyle = (): Promise<StyleResult> => callStyle('refresh');
