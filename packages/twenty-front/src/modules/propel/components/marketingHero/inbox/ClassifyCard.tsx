import { useCallback, useEffect, useState } from 'react';
import {
  Anchor,
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
  IconFilter,
  IconSparkles,
  IconUserCircle,
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
// and (for a Remax Hub agent) link the handle to their CRM staff account — all from
// the Inbox right rail, without leaving the conversation. Writes go through the gated
// POST /contact/classify route (flat body, only changed keys) — the card NEVER
// mutates the Person directly. Tagging any non-prospect type (or linking a staff
// account) filters the contact out of the lead pipeline server-side (no triage, no
// campaigns, no SLA); the card shows that consequence inline.
//
// Placement: directly under the Triage card in InboxContextRail.
//
// CALM REDESIGN (2026-06-25, founder-approved): ONE accent — only the Save button is
// coloured (blue, the calm info/brand accent). Every secondary link is neutral/dimmed,
// never red (red is reserved strictly for destructive actions — there are none here).
// Sentence-case labels, generous spacing, 0.5px dividers, normal/medium weights.
//
// TYPE / TEAM-MEMBER DEDUP: the standalone "Mark as team member" toggle is GONE.
// "Remax Hub agent" is now just a contactType value (Not-prospects group). When that
// type is selected, the card reveals a contextual "Link to their CRM account" picker
// (the same teamMemberIdentity link, reusing listInboxAgents). Hidden for every other
// type. A single neutral consequence line shows for ANY non-prospect type.
//
// Round 2: (1) an AI SUGGESTION pill — on an untagged contact the card asks
// /contact/suggest-type for a likely tag and PRE-SELECTS it in the dropdown when the
// operator clicks Use (never auto-applied — the agent still hits Save). (2) a MERGE
// control — "Merge into existing contact" finds Persons that are likely the same human
// and folds them into THIS contact via /contact/merge.

const NOTE_MAX = 500;

// The contactType value that flags one of our own Remax Hub agents. Selecting it
// reveals the optional "link to their CRM account" staff picker. Mirrors the Phase A
// enum (person-contact-type.field.ts) — a single value, never a separate toggle.
const REMAX_HUB_AGENT = 'REMAX_HUB_AGENT';

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

  // Is the Remax-Hub-agent type selected? — reveals the optional staff-link picker.
  const isRemaxHubAgent = type === REMAX_HUB_AGENT;

  // Re-seed when the open contact changes (switching threads). Keyed on the identity
  // of the committed values so a poll that returns the same values doesn't stomp an
  // in-progress edit.
  useEffect(() => {
    setType(serverType);
    setNote(serverNote);
    setTeamId(serverTeamId);
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

  // Lazily load the staff list the moment the Remax-Hub-agent type is selected, so the
  // contextual link picker has options ready without a separate click.
  useEffect(() => {
    if (isRemaxHubAgent) ensureAgents();
  }, [isRemaxHubAgent, ensureAgents]);

  // When the operator moves OFF the Remax-Hub-agent type, drop any pending staff link —
  // the link only makes sense for an agent, and we never want a stale link to persist.
  useEffect(() => {
    if (!isRemaxHubAgent && teamId !== null) setTeamId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRemaxHubAgent]);

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

  // Whether the SELECTED type would filter the contact out of the lead pipeline — any
  // non-prospect type. Drives the inline consequence line (the founder's "see the
  // effect" ask). Untagged stays in the pipeline, so no line.
  const willFilter =
    (type !== null && type !== '') && !isPipelineContactType(type);

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
        willFilter || (teamId !== null && teamId !== '')
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
          borderBottom: '0.5px solid var(--mantine-color-default-border)',
        }}
      >
        <Text size="sm" fw={500} mb={6}>
          Classify contact
        </Text>
        <Text size="xs" c="dimmed">
          Attach this thread to a contact to classify it.
        </Text>
      </Box>
    );
  }

  return (
    <Box
      p="md"
      style={{ borderBottom: '0.5px solid var(--mantine-color-default-border)' }}
    >
      <Text size="sm" fw={500} mb="md">
        Classify contact
      </Text>

      {/* Untagged prompt — make an unclassified contact obvious, calmly (neutral
          secondary-bg box, no red). */}
      {isUntagged ? (
        <Box
          mb="md"
          style={{
            borderRadius: 8,
            background: 'var(--mantine-color-default-hover)',
            padding: '8px 10px',
          }}
        >
          <Text size="xs" c="dimmed" lh={1.4}>
            Pick what kind of contact this is so non-prospects leave the lead
            queue.
          </Text>
        </Box>
      ) : null}

      {/* AI SUGGESTION pill — the LLM's read of who this is. PRE-SELECTS the tag on
          Use (the agent still hits Save); never auto-applied. Kept calm/neutral — a
          subtle dashed box with a dimmed sparkle, grey actions. Hidden once acted on
          or if the tag already matches the suggestion. */}
      {suggestion &&
      !suggestionDismissed &&
      (type ?? null) !== suggestion.suggestedType ? (
        <Box
          mb="md"
          style={{
            border: '0.5px solid var(--mantine-color-default-border)',
            borderRadius: 8,
            background: 'var(--mantine-color-default-hover)',
            padding: '8px 10px',
          }}
        >
          <Group gap={6} wrap="nowrap" align="flex-start">
            <IconSparkles
              size={14}
              color="var(--mantine-color-dimmed)"
              style={{ flex: 'none', marginTop: 1 }}
            />
            <Box style={{ flex: 1, minWidth: 0 }}>
              <Text size="xs" fw={500}>
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
              <Group gap={6} mt={8}>
                <Button
                  size="compact-xs"
                  variant="default"
                  onClick={acceptSuggestion}
                >
                  Use
                </Button>
                <Anchor
                  component="button"
                  type="button"
                  c="dimmed"
                  onClick={() => setSuggestionDismissed(true)}
                  style={{ fontSize: 12, fontWeight: 500 }}
                >
                  Dismiss
                </Anchor>
              </Group>
            </Box>
          </Group>
        </Box>
      ) : null}

      <Stack gap="md">
        {/* The 3-group type dropdown — contactType lives ONLY here (no duplicate chip
            elsewhere). zIndex 5000 is inherited from PropelMantineProvider
            (Select.defaultProps.comboboxProps.zIndex) so the menu clears Twenty's
            RightDrawer (z1001). */}
        <Select
          size="xs"
          label="Type"
          placeholder="Choose a type…"
          data={CONTACT_TYPE_SELECT_DATA}
          value={type}
          onChange={setType}
          searchable
          clearable
          nothingFoundMessage="No match"
          aria-label="Contact type"
        />

        {/* Inline consequence line — neutral box + filter icon, shown for ANY
            non-prospect type so the operator SEES the effect of the tag (not red). */}
        {willFilter ? (
          <Group
            gap={7}
            wrap="nowrap"
            align="flex-start"
            style={{
              borderRadius: 8,
              background: 'var(--mantine-color-default-hover)',
              padding: '7px 9px',
            }}
          >
            <IconFilter
              size={13}
              color="var(--mantine-color-dimmed)"
              style={{ flex: 'none', marginTop: 1 }}
            />
            <Text size="xs" c="dimmed" lh={1.4}>
              Filtered from campaigns &amp; the lead pipeline
            </Text>
          </Group>
        ) : null}

        {/* Contextual staff link — ONLY for a Remax Hub agent. Links the handle to its
            CRM staff account (teamMemberIdentity); optional. Hidden for every other
            type. zIndex 5000 inherited (clears the RightDrawer). */}
        {isRemaxHubAgent ? (
          <Select
            size="xs"
            label="Link to their CRM account"
            description="Optional"
            placeholder="Pick a team member…"
            leftSection={<IconUserCircle size={14} />}
            data={agents.map((a) => ({ value: a.id, label: a.name }))}
            value={teamId}
            onChange={setTeamId}
            searchable
            clearable
            nothingFoundMessage={agentsLoaded ? 'No team members' : 'Loading…'}
            aria-label="Link to the team member this contact is"
          />
        ) : null}

        {/* Note — durable free-text classification note (≤500). */}
        <Box>
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
          <Text size="xs" c="dimmed" ta="right" mt={4}>
            {note.length}/{NOTE_MAX}
          </Text>
        </Box>

        {/* The ONE accent in the card — the primary Save button (blue = calm info
            accent). Everything else stays neutral. */}
        <Button
          size="xs"
          color="blue"
          fullWidth
          disabled={!dirty || noteTooLong}
          loading={saving}
          onClick={() => void handleSave()}
        >
          Save
        </Button>

        {/* ── Merge into existing contact (Round 2) ─────────────────────────────
            A distinct action from classify-save: find Persons that are likely the
            SAME human (same phone/email/Meta id) and fold them into THIS contact. The
            duplicate's conversations, deals, tasks and notes move here; the duplicate
            is removed. Coordinator-gated server-side. Quiet grey link — not red. */}
        <Box
          mt={2}
          pt="md"
          style={{ borderTop: '0.5px solid var(--mantine-color-default-border)' }}
        >
          {!showMerge ? (
            <Anchor
              component="button"
              type="button"
              c="dimmed"
              onClick={() => void runFindDuplicates()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 12.5,
                fontWeight: 500,
              }}
            >
              <IconArrowMerge size={13} /> Merge with another contact
            </Anchor>
          ) : (
            <Stack gap={10}>
              <Group gap={6} justify="space-between">
                <Text size="xs" fw={500} c="dimmed">
                  Possible duplicates
                </Text>
                <Anchor
                  component="button"
                  type="button"
                  c="dimmed"
                  onClick={() => {
                    setShowMerge(false);
                    setPendingMergeId(null);
                  }}
                  style={{ fontSize: 12, fontWeight: 500 }}
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
                <Stack gap={8}>
                  {candidates.map((cand) => (
                    <Box
                      key={cand.id}
                      style={{
                        border: '0.5px solid var(--mantine-color-default-border)',
                        borderRadius: 8,
                        padding: '8px 10px',
                      }}
                    >
                      <Group gap={6} justify="space-between" wrap="nowrap">
                        <Box style={{ minWidth: 0 }}>
                          <Text size="xs" fw={500} truncate>
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
                          <Group gap={6} wrap="nowrap" style={{ flex: 'none' }}>
                            <Button
                              size="compact-xs"
                              variant="filled"
                              color="blue"
                              loading={merging}
                              onClick={() => void confirmMerge(cand.id)}
                            >
                              Confirm
                            </Button>
                            <Anchor
                              component="button"
                              type="button"
                              c="dimmed"
                              onClick={() => setPendingMergeId(null)}
                              style={{ fontSize: 12, fontWeight: 500 }}
                            >
                              Cancel
                            </Anchor>
                          </Group>
                        ) : (
                          <Button
                            size="compact-xs"
                            variant="default"
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
