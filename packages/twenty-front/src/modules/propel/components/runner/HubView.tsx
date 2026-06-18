import { Stack, Text } from '@mantine/core';
import { useCallback, useMemo, useState } from 'react';
import { AgentHome } from '@/propel/components/runner/AgentHome';
import { AgentPickerModal } from '@/propel/components/runner/AgentPickerModal';
import { BookingModal } from '@/propel/components/runner/BookingModal';
import { ManagerCenter } from '@/propel/components/runner/ManagerCenter';
import { RunnerDrawer } from '@/propel/components/runner/RunnerDrawer';
import { type HubPayload } from '@/propel/types/oneOnOne';

// Orchestrates the role-aware hub body: the manager command-center and/or the
// agent home (player-coach gets both), plus the two overlays the FE graduation
// unlocks for real — a booking Modal and the Runner Drawer. `onMutated` lets the
// page refetch the hub after a booking or a completed meeting.
type BookTarget = {
  agentId: string;
  manager: { id: string; label: string } | null;
  forLabel?: string | null;
} | null;

type RunTarget = { meetingId: string; title: string } | null;

export const HubView = ({
  payload,
  onMutated,
}: {
  payload: HubPayload;
  onMutated: () => void;
}) => {
  const [bookTarget, setBookTarget] = useState<BookTarget>(null);
  const [runTarget, setRunTarget] = useState<RunTarget>(null);
  const [agentPickerOpen, setAgentPickerOpen] = useState(false);

  const showManager =
    (payload.tier === 'MANAGER' || payload.tier === 'PLAYER_COACH') &&
    payload.manager != null;
  const showAgent = payload.agent != null;

  const openRun = useCallback((meetingId: string, title: string) => {
    setRunTarget({ meetingId, title });
  }, []);

  // Agent self-book: against the agent's own manager, for the acting member.
  const openAgentBook = useCallback(() => {
    if (payload.agent == null) return;
    setBookTarget({
      agentId: payload.me.id,
      manager: payload.agent.manager,
      forLabel: null,
    });
  }, [payload]);

  // Manager booking on behalf of a report: against the manager's OWN hours.
  const openBookAgent = useCallback(
    (agent: { id: string; label: string }) => {
      setBookTarget({
        agentId: agent.id,
        manager: { id: payload.me.id, label: payload.me.label },
        forLabel: agent.label,
      });
    },
    [payload],
  );

  // "Add agent" opens an in-hero picker (Mantine Modal) instead of bouncing the
  // user out to /settings/profile. The picker lists workspace members and, on
  // pick, assigns that member's 1:1 manager to the acting manager — after which we
  // refetch the hub so the new report appears in the roster.
  const onManageTeam = useCallback(() => {
    setAgentPickerOpen(true);
  }, []);

  // workspaceMember ids already on the manager's team — hidden from the picker so
  // you can't re-add an existing report.
  const existingTeamIds = useMemo(
    () => (payload.manager?.team ?? []).map((t) => t.agentId),
    [payload.manager],
  );

  return (
    <>
      <Stack gap="xl">
        {showAgent && payload.agent != null ? (
          <AgentHome
            agent={payload.agent}
            weekLabel={payload.me.weekLabel}
            onBook={openAgentBook}
            onRunMeeting={openRun}
          />
        ) : null}

        {showManager && payload.manager != null ? (
          <ManagerCenter
            block={payload.manager}
            onManageTeam={onManageTeam}
            onBookAgent={openBookAgent}
            onRunMeeting={openRun}
          />
        ) : null}

        {!showManager && !showAgent ? (
          <Text size="sm" c="dimmed">
            Nothing to show yet — once you own open leads or manage a team, your
            1:1 week appears here.
          </Text>
        ) : null}
      </Stack>

      <BookingModal
        agentId={bookTarget?.agentId ?? null}
        manager={bookTarget?.manager ?? null}
        forLabel={bookTarget?.forLabel}
        onClose={(booked) => {
          setBookTarget(null);
          if (booked) onMutated();
        }}
      />

      <RunnerDrawer
        meetingId={runTarget?.meetingId ?? null}
        title={runTarget?.title ?? '1:1 Runner'}
        onClose={(changed) => {
          setRunTarget(null);
          if (changed) onMutated();
        }}
      />

      {showManager && payload.manager != null ? (
        <AgentPickerModal
          opened={agentPickerOpen}
          manager={{ id: payload.me.id, label: payload.me.label }}
          existingTeamIds={existingTeamIds}
          onClose={(added) => {
            setAgentPickerOpen(false);
            if (added) onMutated();
          }}
        />
      ) : null}
    </>
  );
};
