import { Drawer, TextInput, Button, Switch, Text, Group, Stack } from '@mantine/core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  IconSearch,
  IconPlus,
  IconTrash,
  IconPencil,
  IconCheck,
  IconBrandInstagram,
} from 'twenty-ui/display';
import { callPropelRoute } from '@/propel/lib/callPropelRoute';

// Manage-competitors side panel (founder-approved 2026-07-14). Two modes:
//  • list  — tracked accounts, type-to-filter (handle/name/tier), on/off, edit, delete.
//  • add   — type a company name → verified IG accounts → add + instant pull.
// Manager/Admin only; the parent only renders the trigger for managerial roles,
// and every route re-checks server-side (a non-manager gets { blocked }).

type AccountRow = {
  id: string;
  name: string;
  displayName: string | null;
  tier: string | null;
  notes: string | null;
  followersCount: number | null;
  isActive: boolean | null;
  isOwnAccount: boolean | null;
  lastError: string | null;
};
type ListResponse = { blocked?: boolean; rows?: AccountRow[] };
type Candidate = { handle: string; displayName: string; followersCount: number };
type SearchResponse = { blocked?: boolean; candidates?: Candidate[] };

const compact = (n: number | null): string => {
  if (n === null) return '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return n.toLocaleString('en-US');
};

export const ManageCompetitorsDrawer = ({
  opened,
  onClose,
  onChanged,
}: {
  opened: boolean;
  onClose: () => void;
  onChanged: () => void; // parent reloads the feed after any change
}) => {
  const [mode, setMode] = useState<'list' | 'add'>('list');
  const [rows, setRows] = useState<AccountRow[]>([]);
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [addingHandle, setAddingHandle] = useState<string | null>(null);

  // Inline edit (displayName / tier / notes) for one row at a time.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editTier, setEditTier] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const loadList = useCallback(async () => {
    setBusy(true);
    const res = await callPropelRoute<ListResponse>('/marketing/competitor-manage', { action: 'list' });
    setRows(res?.rows ?? []);
    setBusy(false);
  }, []);

  useEffect(() => {
    if (opened) {
      setMode('list');
      setFilter('');
      setQuery('');
      setCandidates(null);
      setEditingId(null);
      void loadList();
    }
  }, [opened, loadList]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        (r.name ?? '').toLowerCase().includes(q) ||
        (r.displayName ?? '').toLowerCase().includes(q) ||
        (r.tier ?? '').toLowerCase().includes(q),
    );
  }, [rows, filter]);

  const startEdit = (r: AccountRow) => {
    setEditingId(r.id);
    setEditDisplayName(r.displayName ?? '');
    setEditTier(r.tier ?? '');
    setEditNotes(r.notes ?? '');
  };
  const saveEdit = async (id: string) => {
    await callPropelRoute('/marketing/competitor-manage', {
      action: 'update',
      id,
      displayName: editDisplayName,
      tier: editTier,
      notes: editNotes,
    });
    setEditingId(null);
    await loadList();
    onChanged();
  };

  const toggleActive = async (r: AccountRow) => {
    await callPropelRoute('/marketing/competitor-manage', {
      action: 'update',
      id: r.id,
      isActive: !(r.isActive ?? false),
    });
    await loadList();
    onChanged();
  };

  const remove = async (r: AccountRow) => {
    if (!window.confirm(`Remove @${r.name}? Their existing posts stay in the CRM, but we stop tracking new ones.`)) return;
    await callPropelRoute('/marketing/competitor-manage', { action: 'delete', id: r.id });
    await loadList();
    onChanged();
  };

  const runSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setCandidates(null);
    const res = await callPropelRoute<SearchResponse>('/marketing/competitor-search', { query: query.trim() });
    setCandidates(res?.candidates ?? []);
    setSearching(false);
  };

  const add = async (cand: Candidate) => {
    setAddingHandle(cand.handle);
    const res = await callPropelRoute<{ id?: string; duplicate?: boolean }>('/marketing/competitor-manage', {
      action: 'add',
      handle: cand.handle,
      displayName: cand.displayName,
    });
    // Instant pull so their posts appear right away (best-effort; the daily sync
    // is the backstop if this call fails).
    if (res?.id) {
      await callPropelRoute('/marketing/competitor-sync', { accountId: res.id });
    }
    setAddingHandle(null);
    setCandidates((prev) => (prev ?? []).filter((x) => x.handle !== cand.handle));
    await loadList();
    onChanged();
  };

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size={420}
      title={mode === 'list' ? 'Manage competitors' : 'Add a competitor'}
      zIndex={5000}
    >
      {mode === 'list' ? (
        <Stack gap="sm">
          <Group justify="space-between">
            <Text size="sm" c="dimmed">{rows.length} tracked</Text>
            <Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => setMode('add')}>
              Add
            </Button>
          </Group>
          <TextInput
            placeholder="Filter by name, handle, or tier…"
            leftSection={<IconSearch size={14} />}
            value={filter}
            onChange={(e) => setFilter(e.currentTarget.value)}
          />
          {filter.trim() ? (
            <Text size="xs" c="dimmed">Showing {filtered.length} of {rows.length}</Text>
          ) : null}
          {busy && rows.length === 0 ? (
            <Text size="sm" c="dimmed">Loading…</Text>
          ) : filtered.length === 0 ? (
            <Text size="sm" c="dimmed">No competitors match.</Text>
          ) : (
            filtered.map((r) =>
              editingId === r.id ? (
                <Stack key={r.id} gap={4} style={{ padding: '8px 0', borderBottom: '1px solid var(--p-line, #333)' }}>
                  <Text size="sm" fw={600}>@{r.name}</Text>
                  <TextInput
                    size="xs"
                    label="Display name"
                    value={editDisplayName}
                    onChange={(e) => setEditDisplayName(e.currentTarget.value)}
                  />
                  <TextInput
                    size="xs"
                    label="Tier"
                    value={editTier}
                    onChange={(e) => setEditTier(e.currentTarget.value)}
                  />
                  <TextInput
                    size="xs"
                    label="Notes"
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.currentTarget.value)}
                  />
                  <Group gap="xs" mt={4}>
                    <Button size="xs" onClick={() => void saveEdit(r.id)}>Save</Button>
                    <Button size="xs" variant="subtle" onClick={() => setEditingId(null)}>Cancel</Button>
                  </Group>
                </Stack>
              ) : (
                <Group key={r.id} justify="space-between" wrap="nowrap">
                  <div style={{ minWidth: 0 }}>
                    <Text size="sm" fw={600} truncate>@{r.name}</Text>
                    <Text size="xs" c="dimmed" truncate>
                      {compact(r.followersCount)}{r.tier ? ` · ${r.tier}` : ''}
                      {r.lastError ? ' · ⚠ last sync failed' : ''}
                    </Text>
                  </div>
                  <Group gap="xs" wrap="nowrap">
                    <Switch
                      size="xs"
                      checked={r.isActive ?? false}
                      disabled={r.isOwnAccount === true}
                      onChange={() => void toggleActive(r)}
                      aria-label={r.isActive ? 'Tracking on' : 'Tracking off'}
                    />
                    <Button
                      size="xs"
                      variant="subtle"
                      onClick={() => startEdit(r)}
                      aria-label={`Edit @${r.name}`}
                    >
                      <IconPencil size={14} />
                    </Button>
                    {r.isOwnAccount === true ? null : (
                      <Button
                        size="xs"
                        variant="subtle"
                        color="red"
                        onClick={() => void remove(r)}
                        aria-label={`Remove @${r.name}`}
                      >
                        <IconTrash size={14} />
                      </Button>
                    )}
                  </Group>
                </Group>
              ),
            )
          )}
        </Stack>
      ) : (
        <Stack gap="sm">
          <Button size="xs" variant="subtle" onClick={() => setMode('list')} style={{ alignSelf: 'flex-start' }}>
            ← Back to list
          </Button>
          <TextInput
            placeholder="Type a company name, e.g. Driven Properties"
            leftSection={<IconBrandInstagram size={14} />}
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void runSearch();
            }}
          />
          <Button size="xs" onClick={() => void runSearch()} loading={searching} disabled={!query.trim()}>
            Search Instagram
          </Button>
          {searching ? (
            <Text size="sm" c="dimmed">Searching…</Text>
          ) : candidates === null ? null : candidates.length === 0 ? (
            <Text size="sm" c="dimmed">
              Couldn’t find a matching Instagram business account — check the spelling, or type the exact @handle.
            </Text>
          ) : (
            candidates.map((cand) => (
              <Group key={cand.handle} justify="space-between" wrap="nowrap">
                <div style={{ minWidth: 0 }}>
                  <Text size="sm" fw={600} truncate>{cand.displayName}</Text>
                  <Text size="xs" c="dimmed" truncate>
                    @{cand.handle} · {compact(cand.followersCount)} followers · ✓ Verified
                  </Text>
                </div>
                <Button
                  size="xs"
                  leftSection={<IconCheck size={14} />}
                  loading={addingHandle === cand.handle}
                  onClick={() => void add(cand)}
                >
                  Add
                </Button>
              </Group>
            ))
          )}
        </Stack>
      )}
    </Drawer>
  );
};
