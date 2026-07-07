import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchBlogQueue,
  type BlogPost,
  type BlogStatus,
} from '@/propel/lib/blogCrm';

// Fetch hook for the Blog tab's pipeline board. Same return shape as the other
// live hero hooks (useLandingPages / useSiteLeads): { phase, error, ... , reload }.
//
// Graceful degrade (mirrors useLandingPages): the blog routes ship behind the
// gated CRM deploy, so before they land the queue route returns null and the lib
// hands us { ok:false }. Rather than a dead screen we drop to a clean PREVIEW
// state — empty columns + an honest banner ("goes live when the blog pipeline is
// deployed") — and stash the reason in `error`. It becomes real automatically once
// the routes deploy, no code change. It NEVER throws — the hero can't crash on it.

export type BlogPhase = 'loading' | 'ready';

// Four visible columns. `failed` rows ride inside the In-progress column so the
// board stays 4-wide (WEBSITE-REBUILD-DESIGN §6).
export interface BlogColumns {
  inProgress: BlogPost[]; // idea | grounding | drafting | seo_review
  needsApproval: BlogPost[]; // the HumanGate queue
  scheduled: BlogPost[];
  published: BlogPost[];
  failed: BlogPost[]; // surfaced at the top of In-progress
}

export type BlogAgentKey = 'ideas' | 'writer' | 'seoReviewer' | 'scheduler';

export interface UseBlogPipelineResult {
  phase: BlogPhase;
  error: string | null;
  preview: boolean; // true when the routes aren't reachable (empty/preview mode)
  columns: BlogColumns;
  activeAgents: Set<BlogAgentKey>;
  total: number;
  reload: () => void;
}

const EMPTY_COLUMNS: BlogColumns = {
  inProgress: [],
  needsApproval: [],
  scheduled: [],
  published: [],
  failed: [],
};

const IN_PROGRESS: ReadonlySet<BlogStatus> = new Set<BlogStatus>([
  'idea',
  'grounding',
  'drafting',
  'seo_review',
]);

const bucket = (posts: BlogPost[]): BlogColumns => {
  const cols: BlogColumns = {
    inProgress: [],
    needsApproval: [],
    scheduled: [],
    published: [],
    failed: [],
  };
  for (const p of posts) {
    if (p.status === 'needs_approval') cols.needsApproval.push(p);
    else if (p.status === 'scheduled') cols.scheduled.push(p);
    else if (p.status === 'published') cols.published.push(p);
    else if (p.status === 'failed') cols.failed.push(p);
    else if (IN_PROGRESS.has(p.status)) cols.inProgress.push(p);
  }
  return cols;
};

// Which pipeline agents are "active" right now = which stages currently hold work.
const deriveActiveAgents = (posts: BlogPost[]): Set<BlogAgentKey> => {
  const active = new Set<BlogAgentKey>();
  for (const p of posts) {
    if (p.status === 'idea' || p.status === 'grounding') active.add('ideas');
    else if (p.status === 'drafting') active.add('writer');
    else if (p.status === 'seo_review') active.add('seoReviewer');
    else if (p.status === 'scheduled') active.add('scheduler');
  }
  return active;
};

export const useBlogPipeline = (): UseBlogPipelineResult => {
  const [phase, setPhase] = useState<BlogPhase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [columns, setColumns] = useState<BlogColumns>(EMPTY_COLUMNS);
  const [activeAgents, setActiveAgents] = useState<Set<BlogAgentKey>>(new Set());
  const [total, setTotal] = useState(0);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    setPhase('loading');
    setError(null);
    const result = await fetchBlogQueue();
    if (!mounted.current) return;
    if (result.ok) {
      setColumns(bucket(result.data));
      setActiveAgents(deriveActiveAgents(result.data));
      setTotal(result.data.length);
      setPreview(false);
      setPhase('ready');
    } else {
      // routes unavailable (not deployed / not a Manager) → clean preview state
      setColumns(EMPTY_COLUMNS);
      setActiveAgents(new Set());
      setTotal(0);
      setPreview(true);
      setError(result.error);
      setPhase('ready');
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  return {
    phase,
    error,
    preview,
    columns,
    activeAgents,
    total,
    reload: () => void load(),
  };
};
