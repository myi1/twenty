import { Alert, Center, Loader, Stack } from '@mantine/core';
import { IconAlertTriangle } from 'twenty-ui/display';

import { SettingsConfigGroupCard } from '@/propel/components/settings/SettingsConfigGroupCard';
import { LANE_GROUPS, ROUTING_GROUP } from '@/propel/lib/settingsHubConfig';
import { useSettingsAutomationConfig } from '@/propel/hooks/useSettingsAutomationConfig';

// The Lead Routing + Lane Automations tabs. Both render singleton-config cards from
// the SAME /settings/automation-config read (one hook instance per tab is fine —
// each owns its own load, and edits are scoped by group key). `which` picks the
// group set: 'routing' = the one brokerage-wide record; 'lanes' = the 4 per-lane
// AutomationConfig records.

export const SettingsSingletonConfigTab = ({
  which,
}: {
  which: 'routing' | 'lanes';
}) => {
  const { phase, error, configs, members, canEdit, savingKey, saveGroup, seed } =
    useSettingsAutomationConfig();

  const groups = which === 'routing' ? [ROUTING_GROUP] : LANE_GROUPS;

  return (
    <Stack gap="md">
      {error !== null && (
        <Alert
          color="red"
          variant="light"
          icon={<IconAlertTriangle size={16} />}
        >
          {error}
        </Alert>
      )}

      {phase === 'loading' ? (
        <Center py="xl">
          <Loader size="sm" />
        </Center>
      ) : (
        groups.map((group) => (
          <SettingsConfigGroupCard
            key={group.key}
            group={group}
            row={configs[group.key] ?? null}
            members={members}
            canEdit={canEdit}
            saving={savingKey === group.key || savingKey === '__seed'}
            onSave={saveGroup}
            onSeed={seed}
          />
        ))
      )}
    </Stack>
  );
};
