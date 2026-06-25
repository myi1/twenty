import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Anchor,
  Badge,
  Box,
  Button,
  Group,
  Select,
  Stack,
  Text,
  Textarea,
} from '@mantine/core';
import {
  IconArrowMerge,
  IconBriefcase,
  IconCheck,
  IconSparkles,
  IconTag,
  IconUnlink,
  IconUsers,
  IconX,
} from 'twenty-ui/display';
import {
  type ContactTypeSuggestion,
  type InboxAgentOption,
  type InboxContact,
  type MergeCandidate,
} from '@/propel/types/inbox';
import {
  classifyContact,
  findContactDuplicates,
  listInboxAgents,
  mergeContact,
  suggestContactType,
} from '@/propel/lib/inboxApi';
import { usePropelToast } from '@/propel/hooks/usePropelToast';
import {
  CONTACT_TYPE_SELECT_DATA,
  contactTypeLabel,
  isPipelineContactType,
} from '@/propel/lib/contactTags';

// ── Contact-tagging (Phase B) — the "Classify" card ──────────────────────────
// Lets an operator quickly say WHAT KIND of contact this is, attach a short note,
// and optionally mark the handle as one of our own team members — all from the
// Inbox right rail, without leaving the conversation. Writes go through the gated
// POST /contact/classify route (flat body, only changed keys) — the card NEVER
// mutates the Person directly. Tagging a non-prospect (or linking a team member)
// filters the contact out of the lead pipeline server-side (no triage, no
// campaigns, no SLA); the card shows that consequence inline.
//
// Placement: directly under the Triage card in InboxContextRail.
//
// Round 2 (this file): (1) an AI SUGGESTION pill — on an untagged contact the card
// asks /contact/suggest-type for a likely tag, shows it as "Suggested: <type> —
// <reason>", and PRE-SELECTS it in the dropdown when the operator clicks Use. It is
// NEVER auto-applied — the agent still hits Save (AI suggests, human confirms). (2) a
// MERGE control — "Find duplicate contacts" runs /contact/find-duplicates, lists the
// matches with WHY each matched, and on confirm folds the duplicate into THIS contact
// via /contact/merge (the engine repoints relations + removes the duplicate).

const NOTE_MAX = 500;

// Human label for a match axis (find-duplicates).
const REASON_LABEL: Record<string, string> = {
  phone: 'same phone',
  email: 'same email',
  metaUserId: 'same Meta id',
};
const matchReasonText = (reasons: string[]): string =>
  reasons.map((r) => REASON_LABEL[r] ?? r).join(' · ') || 'possible match';

export const ClassifyCard = ({
  personId,
  contact,
  onActed,
}: {
  // The matched Person id — required to classify. When null, the card shows a hint
  // (you can't tag a thread that isn't attached to a contact yet).
  personId: string | null;
  // The thread's contact, carrying the current tag / note / team-link to seed from.
  contact: InboxContact | null;
  // Refresh the list + thread after a successful save (a new tag may regroup the
  // thread into "Known / internal", or change the chip).
  onActed: () => void;
}) => {
  const notify = usePropelToast();

  // The committed (server) values — what the contact currently is. Seeded from the
  // thread payload; re-seeded whenever the thread/contact changes.
  const serverType = contact?.contactType ?? null;
  const serverNote = contact?.contactTagNote ?? '';
  const serverTeamId = contact?.teamMemberIdentityId ?? null;
  const serverTeamName = contact?.teamMemberIdentityName ?? '';

  // Local edits.
  const [type, setType] = useState<string | null>(serverType);
  const [note, setNote] = useState<string>(serverNote);
  const [teamId, setTeamId] = useState<string | null>(serverTeamId);
  const [showStaffPicker, setShowStaffPicker] = useState(false);
  const [agents, setAgents] = useState<InboxAgentOption[]>([]);
  const [agentsLoaded, setAgentsLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  // ── AI suggestion (Round 2) ──────────────────────────────────────────────
  // The LLM's suggested tag for an UNTAGGED contact. null = none (env unset, no
  // signal, or dismissed). dismissed hides the pill for this contact once acted on.
  const [suggestion, setSuggestion] = useState<ContactTypeSuggestion | null>(null);
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);

  // ── Merge control (Round 2) ──────────────────────────────────────────────
  const [showMerge, setShowMerge] = useState(false);
  const [finding, setFinding] = useState(false);
  const [candidates, setCandidates] = useState<MergeCandidate[]>([]);
  const [foundOnce, setFoundOnce] = useState(false);
  const [pendingMergeId, setPendingMergeId] = useState<string | null>(null); // confirm step
  const [merging, setMerging] = useState(false);

  // Re-seed when the open contact changes (switching threads). Keyed on the identity
  // of the committed values so a poll that returns the same values doesn't stomp an
  // in-progress edit.
  useEffect(() => {
    setType(serverType);
    setNote(serverNote);
    setTeamId(serverTeamId);
    setShowStaffPicker(false);
    // reset the Round-2 surfaces on a thread switch
    setSuggestion(null);
    setSuggestionDismissed(false);
    setShowMerge(false);
    setCandidates([]);
    setFoundOnce(false);
    setPendingMergeId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personId, serverType, serverNote, serverTeamId]);

  // Fetch an AI suggestion ONCE per untagged contact. Never errors the card — the
  // route degrades to suggestion:null when the AI env is unset / the read fails.
  useEffect(() => {
    if (personId === null || personId === '') return;
    // Only suggest for an untagged, unlinked contact — a tagged one needs no nudge.
    if ((serverType !== null && serverType !== '') || (serverTeamId !== null && serverTeamId !== ''))
      return;
    let live = true;
    void suggestContactType(personId).then((res) => {
      if (!live) return;
      setSuggestion(res?.ok && res.suggestion ? res.suggestion : null);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personId, serverType, serverTeamId]);

  const ensureAgents = useCallback(() => {
    if (agentsLoaded) return;
    setAgentsLoaded(true);
    void listInboxAgents().then(setAgents);
  }, [agentsLoaded]);

  // The team-link display name: prefer the freshly-picked agent's name, else the
  // server-resolved name for the committed link.
  const teamName = useMemo(() => {
    if (teamId === null) return '';
    if (teamId === serverTeamId && serverTeamName) return serverTeamName;
    return agents.find((a) => a.id === teamId)?.name ?? serverTeamName ?? '';
  }, [teamId, serverTeamId, serverTeamName, agents]);

  // Is the contact untagged AND unlinked? — the prominent "classify this" prompt.
  const isUntagged =
    (serverType === null || serverType === '') &&
    (serverTeamId === null || serverTeamId === '');

  // Dirty detection per field — we only send keys the operator actually changed, so a
  // save never overwrites a value with itself (and `null` correctly clears/unlinks).
  const typeChanged = (type ?? null) !== (serverType ?? null);
  const noteChanged = note.trim() !== serverNote.trim();
  const teamChanged = (teamId ?? null) !== (serverTeamId ?? null);
  const dirty = typeChanged || noteChanged || teamChanged;

  // Whether the contact WOULD be filtered out of the lead pipeline given the pending
  // selection: a non-prospect tag OR a set team-member link filters. Drives the
  // inline "Filtered from lead pipeline" status line (the founder's "see the
  // consequence" ask).
  const willFilter =
    (teamId !== null && teamId !== '') || !isPipelineContactType(type);

  const noteTooLong = note.length > NOTE_MAX;

  const handleSave = async () => {
    if (personId === null || personId === '' || !dirty || saving || noteTooLong)
      return;
    setSaving(true);
    const res = await classifyContact({
      personId,
      ...(typeChanged ? { contactType: type } : {}),
      // Empty note clears it (send explicit null); otherwise the trimmed text.
      ...(noteChanged
        ? { contactTagNote: note.trim() === '' ? null : note.trim() }
        : {}),
      ...(teamChanged ? { teamMemberIdentityId: teamId } : {}),
    });
    setSaving(false);
    if (res?.ok) {
      notify(
        willFilter
          ? 'Saved. This contact is now filtered out of the lead pipeline.'
          : 'Contact classified.',
        'success',
      );
      onActed();
    } else {
      notify(
        res?.operatorAction ||
          res?.error ||
          'Couldn’t save — you may not have permission.',
        'error',
      );
    }
  };

  // Accept the AI suggestion: PRE-SELECT it in the dropdown (the agent still hits
  // Save — never auto-applied). Dismissing just hides the pill for this contact.
  const acceptSuggestion = () => {
    if (!suggestion) return;
    setType(suggestion.suggestedType);
    setSuggestionDismissed(true);
  };

  // Run the duplicate search. Read-only; populates the candidate list.
  const runFindDuplicates = async () => {
    if (personId === null || personId === '' || finding) return;
    setShowMerge(true);
    setFinding(true);
    setPendingMergeId(null);
    const res = await findContactDuplicates(personId);
    setFinding(false);
    setFoundOnce(true);
    if (res?.ok) {
      setCandidates(Array.isArray(res.candidates) ? res.candidates : []);
    } else {
      setCandidates([]);
      notify(
        res?.operatorAction || res?.error || 'Couldn’t search for duplicates.',
        'error',
      );
    }
  };

  // Confirm + perform the merge: fold `dupId` INTO this contact (the canonical).
  const confirmMerge = async (dupId: string) => {
    if (personId === null || personId === '' || merging) return;
    setMerging(true);
    const res = await mergeContact({ canonicalId: personId, duplicateId: dupId });
    setMerging(false);
    setPendingMergeId(null);
    if (res?.ok) {
      notify(
        res.merged === false
          ? 'That contact was already merged.'
          : 'Contacts merged — the duplicate was folded into this one.',
        'success',
      );
      // The duplicate is gone + relations moved here. Drop it from the list and
      // refresh the thread/list (a merged-away conversation now points here).
      setCandidates((prev) => prev.filter((c) => c.id !== dupId));
      onActed();
    } else {
      notify(
        res?.operatorAction || res?.error || 'Merge failed — you may not have permission.',
        'error',
      );
    }
  };

  // No matched contact → can't classify. A hint, not dead controls.
  if (personId === null || personId === '') {
    return (
      <Box
        p="md"
        style={{
          borderBottom: '1px solid var(--mantine-color-default-border)',
        }}
      >
        <Group gap={6} mb={6}>
          <IconTag size={13} color="var(--mantine-color-red-6)" />
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">
            Classify
          </Text>
        </Group>
        <Text size="xs" c="dimmed">
          Attach this thread to a contact to classify it.
        </Text>
      </Box>
    );
  }

  return (
    <Box
      p="md"
      style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
    >
      <Group gap={6} mb="sm">
        <IconTag size={13} color="var(--mantine-color-red-6)" />
        <Text size="xs" tt="uppercase" fw={700} c="dimmed">
          Classify
        </Text>
        {/* Current committed tag chip — what the contact IS right now. */}
        {serverType ? (
          <Badge size="xs" variant="light" color="gray" ml="auto">
            {contactTypeLabel(serverType)}
          </Badge>
        ) : null}
      </Group>

      {/* Untagged prompt — make an unclassified contact obvious + one-tap fast. */}
      {isUntagged ? (
        <Box
          mb="sm"
          style={{
            border: '1px solid var(--mantine-color-red-light)',
            borderRadius: 8,
            background:
              'linear-gradient(180deg, var(--mantine-color-red-light), transparent 80%)',
            padding: '8px 10px',
          }}
        >
          <Text size="xs" fw={600}>
            Untagged — classify this contact
          </Text>
          <Text size="xs" c="dimmed" mt={2}>
            Pick what kind of contact this is so non-prospects leave the lead
            queue.
          </Text>
        </Box>
      ) : null}

      {/* AI SUGGESTION pill — the LLM's read of who this is. PRE-SELECTS the tag on
          Use (the agent still hits Save); never auto-applied. Hidden once acted on or
          if the tag already matches the suggestion. */}
      {suggestion &&
      !suggestionDismissed &&
      (type ?? null) !== suggestion.suggestedType ? (
        <Box
          mb="sm"
          style={{
            border: '1px solid var(--mantine-color-violet-light)',
            borderRadius: 8,
            background: 'var(--mantine-color-violet-light)',
            padding: '8px 10px',
          }}
        >
          <Group gap={6} wrap="nowrap" align="flex-start">
            <IconSparkles
              size={14}
              color="var(--mantine-color-violet-7)"
              style={{ flex: 'none', marginTop: 1 }}
            />
            <Box style={{ flex: 1, minWidth: 0 }}>
              <Text size="xs" fw={600}>
                Suggested: {contactTypeLabel(suggestion.suggestedType)}
                {suggestion.confidence === 'low' ? (
                  <Text span size="xs" c="dimmed" fw={400}>
                    {' '}
                    (low confidence)
                  </Text>
                ) : null}
              </Text>
              {suggestion.reason ? (
                <Text size="xs" c="dimmed" mt={1} lh={1.35}>
                  {suggestion.reason}
                </Text>
              ) : null}
              <Group gap={6} mt={6}>
                <Button
                  size="compact-xs"
                  variant="light"
                  color="violet"
                  leftSection={<IconCheck size={11} />}
                  onClick={acceptSuggestion}
                >
                  Use
                </Button>
                <Button
                  size="compact-xs"
                  variant="subtle"
                  color="gray"
                  leftSection={<IconX size={11} />}
                  onClick={() => setSuggestionDismissed(true)}
                >
                  Dismiss
                </Button>
              </Group>
            </Box>
          </Group>
        </Box>
      ) : null}

      <Stack gap={9}>
        {/* The 3-group tag dropdown. zIndex 5000 is inherited from
            PropelMantineProvider (Select.defaultProps.comboboxProps.zIndex) so the
            menu clears Twenty's RightDrawer (z1001). */}
        <Select
          size="xs"
          label="Tag"
          placeholder="Choose a type…"
          data={CONTACT_TYPE_SELECT_DATA}
          value={type}
          onChange={setType}
          searchable
          clearable
          nothingFoundMessage="No match"
          aria-label="Contact type"
        />

        {/* Note — durable free-text classification note (≤500). */}
        <Textarea
          size="xs"
          label="Note"
          placeholder="e.g. Samia — our IG content agent"
          value={note}
          onChange={(e) => setNote(e.currentTarget.value)}
          autosize
          minRows={2}
          maxRows={4}
          error={
            noteTooLong
              ? `Too long — ${note.length}/${NOTE_MAX} characters`
              : undefined
          }
          aria-label="Classification note"
        />
        <Text size="xs" c="dimmed" ta="right" mt={-6}>
          {note.length}/{NOTE_MAX}
        </Text>

        {/* Team-member link — "this contact IS one of our staff". Distinct from
            assignedAgent ("handled by"). Setting it implies internal/non-prospect. */}
        <Box>
          <Text size="xs" fw={600} mb={4}>
            Is a team member
          </Text>
          {teamId !== null && teamId !== '' ? (
            <Group gap={7} wrap="nowrap">
              <Badge
                size="sm"
                variant="light"
                color="red"
                leftSection={<IconBriefcase size={11} />}
                style={{ maxWidth: '100%' }}
              >
                {teamName || 'Linked staff member'}
              </Badge>
              <Anchor
                component="button"
                type="button"
                onClick={() => {
                  setTeamId(null);
                  setShowStaffPicker(false);
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 12,
                  fontWeight: 600,
                  flex: 'none',
                }}
              >
                <IconUnlink size={12} /> Unlink
              </Anchor>
            </Group>
          ) : showStaffPicker ? (
            <Select
              size="xs"
              placeholder="Pick a team member…"
              data={agents.map((a) => ({ value: a.id, label: a.name }))}
              value={null}
              onChange={(v) => {
                setTeamId(v);
                setShowStaffPicker(false);
              }}
              searchable
              nothingFoundMessage={
                agentsLoaded ? 'No team members' : 'Loading…'
              }
              aria-label="Pick the team member this contact is"
            />
          ) : (
            <Anchor
              component="button"
              type="button"
              onClick={() => {
                ensureAgents();
                setShowStaffPicker(true);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 12.5,
                fontWeight: 600,
              }}
            >
              <IconBriefcase size={13} /> This contact is a staff member
            </Anchor>
          )}
        </Box>

        {/* The consequence line — show that a filtered selection leaves the pipeline,
            so the operator SEES the effect of tagging a non-prospect / staff member. */}
        {willFilter ? (
          <Text size="xs" c="dimmed" lh={1.4}>
            <IconCheck size={11} style={{ verticalAlign: -1 }} /> Filtered from
            lead pipeline · no SLA, no campaigns
          </Text>
        ) : null}

        <Button
          size="xs"
          color="red"
          fullWidth
          disabled={!dirty || noteTooLong}
          loading={saving}
          onClick={() => void handleSave()}
        >
          Save classification
        </Button>

        {/* ── Merge into existing contact (Round 2) ─────────────────────────────
            A distinct action from classify-save: find Persons that are likely the
            SAME human (same phone/email/Meta id) and fold them into THIS contact.
            The duplicate's conversations, deals, tasks and notes move here; the
            duplicate is removed. Coordinator-gated server-side. */}
        <Box
          mt={4}
          pt={10}
          style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}
        >
          {!showMerge ? (
            <Anchor
              component="button"
              type="button"
              onClick={() => void runFindDuplicates()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 12.5,
                fontWeight: 600,
              }}
            >
              <IconArrowMerge size={13} /> Merge into existing contact
            </Anchor>
          ) : (
            <Stack gap={8}>
              <Group gap={6} justify="space-between">
                <Group gap={5}>
                  <IconUsers size={13} color="var(--mantine-color-dimmed)" />
                  <Text size="xs" tt="uppercase" fw={700} c="dimmed">
                    Possible duplicates
                  </Text>
                </Group>
                <Anchor
                  component="button"
                  type="button"
                  onClick={() => {
                    setShowMerge(false);
                    setPendingMergeId(null);
                  }}
                  style={{ fontSize: 12, fontWeight: 600 }}
                >
                  Close
                </Anchor>
              </Group>

              {finding ? (
                <Text size="xs" c="dimmed">
                  Searching for duplicates…
                </Text>
              ) : candidates.length === 0 ? (
                <Text size="xs" c="dimmed">
                  {foundOnce
                    ? 'No likely duplicates found.'
                    : 'Tap to search for duplicates.'}
                </Text>
              ) : (
                <Stack gap={7}>
                  {candidates.map((cand) => (
                    <Box
                      key={cand.id}
                      style={{
                        border: '1px solid var(--mantine-color-default-border)',
                        borderRadius: 8,
                        padding: '8px 10px',
                      }}
                    >
                      <Group gap={6} justify="space-between" wrap="nowrap">
                        <Box style={{ minWidth: 0 }}>
                          <Text size="xs" fw={600} truncate>
                            {cand.name}
                          </Text>
                          <Text size="xs" c="dimmed" truncate>
                            {matchReasonText(cand.matchReasons)}
                            {cand.contactType
                              ? ` · ${contactTypeLabel(cand.contactType)}`
                              : ''}
                          </Text>
                          {cand.email || cand.phone ? (
                            <Text size="xs" c="dimmed" truncate>
                              {[cand.phone, cand.email]
                                .filter(Boolean)
                                .join('  ·  ')}
                            </Text>
                          ) : null}
                        </Box>
                        {pendingMergeId === cand.id ? (
                          <Group gap={5} wrap="nowrap" style={{ flex: 'none' }}>
                            <Button
                              size="compact-xs"
                              color="red"
                              loading={merging}
                              onClick={() => void confirmMerge(cand.id)}
                            >
                              Confirm
                            </Button>
                            <Anchor
                              component="button"
                              type="button"
                              onClick={() => setPendingMergeId(null)}
                              style={{ fontSize: 12, fontWeight: 600 }}
                            >
                              Cancel
                            </Anchor>
                          </Group>
                        ) : (
                          <Button
                            size="compact-xs"
                            variant="light"
                            color="red"
                            leftSection={<IconArrowMerge size={11} />}
                            style={{ flex: 'none' }}
                            disabled={merging}
                            onClick={() => setPendingMergeId(cand.id)}
                          >
                            Merge
                          </Button>
                        )}
                      </Group>
                      {/* Conflict preview — what THIS contact keeps vs the duplicate's
                          differing value (this contact always wins; nothing is lost —
                          relations are combined). Shown only when confirming. */}
                      {pendingMergeId === cand.id && cand.conflicts.length > 0 ? (
                        <Text size="xs" c="dimmed" mt={6} lh={1.4}>
                          Keeps this contact’s{' '}
                          {cand.conflicts.map((cf) => cf.field).join(', ')}; the
                          duplicate’s other details fold in.
                        </Text>
                      ) : null}
                    </Box>
                  ))}
                </Stack>
              )}
            </Stack>
          )}
        </Box>
      </Stack>
    </Box>
  );
};
