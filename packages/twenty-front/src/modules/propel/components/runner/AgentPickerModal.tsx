import {
  Alert,
  Button,
  Center,
  Group,
  Loader,
  Modal,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { IconSearch, IconUserPlus } from 'twenty-ui/display';
import { usePropelToast } from '@/propel/hooks/usePropelToast';
import {
  listWorkspaceMembers,
  setMemberManager,
  type WorkspaceMemberRow,
} from '@/propel/lib/oneOnOneCrm';

type Phase = 'loading' | 'list' | 'error';

// In-hero "Add agent" picker (replaces the old settings deep-link). Lists every
// workspace member, excludes the acting manager and anyone already on their team,
// and on pick sets that member's `managerId` to the manager — the same scalar
// `updateWorkspaceMember({ managerId })` write the in-sandbox "Set 1:1 manager"
// panel used. On success it closes and asks the hub to refetch so the new report
// shows up in the team roster immediately.
//
// zIndex 5000 keeps the modal above any Twenty drawer/modal layer (the documented
// Propel convention — see PropelMantineProvider), so it never opens behind the CRM.
export const AgentPickerModal = ({
  opened,
  manager,
  existingTeamIds,
  onClose,
}: {
  opened: boolean;
  /** the acting manager: new reports get their managerId set to this id */
  manager: { id: string; label: string };
  /** workspaceMember ids already on the manager's team (hidden from the picker) */
  existingTeamIds: string[];
  /** added = true when a report was assigned (the hub should refetch) */
  onClose: (added: boolean) => void;
}) => {
  const notify = usePropelToast();
  const [phase, setPhase] = useState<Phase>('loading');
  const [members, setMembers] = useState<WorkspaceMemberRow[]>([]);
  const [query, setQuery] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  const excluded = useMemo(
    () => new Set<string>([manager.id, ...existingTeamIds]),
    [manager.id, existingTeamIds],
  );

  const load = useCallback(async () => {
    setPhase('loading');
    const rows = await listWorkspaceMembers();
    setMembers(rows);
    setPhase(rows.length > 0 ? 'list' : 'error');
  }, []);

  useEffect(() => {
    if (!opened) return;
    setQuery('');
    setSavingId(null);
    void load();
  }, [opened, load]);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members
      .filter((m) => !excluded.has(m.id))
      .filter((m) => (q === '' ? true : m.label.toLowerCase().includes(q)));
  }, [members, excluded, query]);

  const add = useCallback(
    async (member: WorkspaceMemberRow) => {
      setSavingId(member.id);
      const ok = await setMemberManager(member.id, manager.id);
      if (!ok) {
        setSavingId(null);
        notify(`Couldn’t add ${member.label} to your team.`, 'error');
        return;
      }
      notify(`${member.label} added to your team`, 'success');
      onClose(true);
    },
    [manager.id, notify, onClose],
  );

  return (
    <Modal
      opened={opened}
      onClose={() => onClose(false)}
      title="Add an agent to your team"
      size="md"
      centered
      zIndex={5000}
      closeOnClickOutside={savingId === null}
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Pick a member to add as a direct report. They’ll appear in your team
          roster — with booking status, flagged leads, and last 1:1 — and can
          book 1:1s on your hours.
        </Text>

        {phase === 'loading' ? (
          <Center py="xl">
            <Loader color="red" size="sm" />
          </Center>
        ) : null}

        {phase === 'error' ? (
          <Alert color="gray" variant="light">
            Couldn’t load workspace members. Close and try again.
          </Alert>
        ) : null}

        {phase === 'list' ? (
          <>
            <TextInput
              placeholder="Search members…"
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
              leftSection={<IconSearch size={16} />}
              autoFocus
            />

            {candidates.length === 0 ? (
              <Text size="sm" c="dimmed" py="sm">
                {query.trim() === ''
                  ? 'Everyone already reports to you.'
                  : `No members match “${query.trim()}”.`}
              </Text>
            ) : (
              <ScrollArea.Autosize mah={320} type="auto">
                <Stack gap={4}>
                  {candidates.map((m) => {
                    const saving = savingId === m.id;
                    const disabled = savingId !== null && !saving;
                    return (
                      <UnstyledButton
                        key={m.id}
                        onClick={() => void add(m)}
                        disabled={savingId !== null}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 8,
                          opacity: disabled ? 0.5 : 1,
                          cursor: savingId !== null ? 'default' : 'pointer',
                        }}
                      >
                        <Group justify="space-between" wrap="nowrap">
                          <Text size="sm" fw={500} truncate>
                            {m.label}
                          </Text>
                          {saving ? (
                            <Loader color="red" size="xs" />
                          ) : (
                            <Group gap={6} c="red" wrap="nowrap">
                              <IconUserPlus size={16} />
                              <Text size="xs" c="red" fw={600}>
                                Add
                              </Text>
                            </Group>
                          )}
                        </Group>
                      </UnstyledButton>
                    );
                  })}
                </Stack>
              </ScrollArea.Autosize>
            )}
          </>
        ) : null}

        <Group justify="flex-end">
          <Button variant="default" onClick={() => onClose(false)}>
            Done
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
