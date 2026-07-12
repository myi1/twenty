import { Box, Tabs, Text } from '@mantine/core';
import { useState } from 'react';
import {
  IconAdjustments,
  IconBolt,
  IconGitBranch,
  IconMoon,
  IconUsers,
  IconWorld,
} from 'twenty-ui/display';

import { SettingsAgentProfilesTab } from '@/propel/components/settings/SettingsAgentProfilesTab';
import { SettingsCustomFieldsTab } from '@/propel/components/settings/SettingsCustomFieldsTab';
import { SettingsLeadSourcesTab } from '@/propel/components/settings/SettingsLeadSourcesTab';
import { SettingsQuietHoursTab } from '@/propel/components/settings/SettingsQuietHoursTab';
import { SettingsSingletonConfigTab } from '@/propel/components/settings/SettingsSingletonConfigTab';

// Config tab of the unified Marketing hero (#70 → folded into #41). The
// brokerage's operational config, editable in one place — formerly the standalone
// Settings Hub hero (SettingsHubPage), now a sub-tab of Marketing per founder
// direction. MANAGER/ADMIN ONLY: the hero gates this tab's visibility with the
// same useViewerRole signal as the (now-removed) Lead Routing tab; every WRITE is
// additionally fail-closed server-side, so this is a pure UX gate.
//
// Each sub-tab is the SAME, UNCHANGED self-contained settings component the
// Settings Hub hero used, reusing the UNCHANGED gated CRM logic-function routes
// via callPropelRoute (no app-side schema or route change):
//   • Lead routing     → /settings/automation-config (brokerage-wide singleton)
//   • Lane automations → /settings/automation-config (the 4 per-lane singletons)
//   • Agent profiles   → /lead/agent-profile
//   • Lead sources     → /lead/source-config (+ /seed) — this SUPERSEDES the
//                        former top-level "Lead Routing" Marketing tab, which read
//                        the same route.
//   • Quiet hours      → /marketing/hub (read) + /marketing/save-rules (write)
//   • Custom fields    → /settings/custom-fields
//
// A nested second-level Mantine Tabs (state-driven; this is a non-URL sub-surface
// inside the URL-driven ?tab=config) keeps the 6 sub-tabs grouped under one
// Marketing tab rather than flooding the top-level tab strip.

type ConfigTabKey =
  | 'routing'
  | 'lanes'
  | 'agents'
  | 'sources'
  | 'quiet'
  | 'fields';

export const ConfigTab = () => {
  const [tab, setTab] = useState<ConfigTabKey>('routing');

  return (
    <Box style={{ padding: '12px 20px 32px' }}>
      <Box maw={980} mx="auto">
        <Text size="sm" c="dimmed" mb="lg" style={{ lineHeight: 1.5 }}>
          Everything the team runs on, editable in one place — no developer needed.
          Changes apply on the next lead or the next check; nothing here touches
          code.
        </Text>

        <Tabs
          value={tab}
          onChange={(v) => v && setTab(v as ConfigTabKey)}
          color="red"
          keepMounted={false}
        >
          <Tabs.List mb="lg">
            <Tabs.Tab value="routing" leftSection={<IconGitBranch size={15} />}>
              Lead routing
            </Tabs.Tab>
            <Tabs.Tab value="lanes" leftSection={<IconBolt size={15} />}>
              Lane automations
            </Tabs.Tab>
            <Tabs.Tab value="agents" leftSection={<IconUsers size={15} />}>
              Agent profiles
            </Tabs.Tab>
            <Tabs.Tab value="sources" leftSection={<IconWorld size={15} />}>
              Lead sources
            </Tabs.Tab>
            <Tabs.Tab value="quiet" leftSection={<IconMoon size={15} />}>
              Quiet hours
            </Tabs.Tab>
            <Tabs.Tab value="fields" leftSection={<IconAdjustments size={15} />}>
              Custom fields
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="routing">
            <SettingsSingletonConfigTab which="routing" />
          </Tabs.Panel>
          <Tabs.Panel value="lanes">
            <SettingsSingletonConfigTab which="lanes" />
          </Tabs.Panel>
          <Tabs.Panel value="agents">
            <SettingsAgentProfilesTab />
          </Tabs.Panel>
          <Tabs.Panel value="sources">
            <SettingsLeadSourcesTab />
          </Tabs.Panel>
          <Tabs.Panel value="quiet">
            <SettingsQuietHoursTab />
          </Tabs.Panel>
          <Tabs.Panel value="fields">
            <SettingsCustomFieldsTab />
          </Tabs.Panel>
        </Tabs>
      </Box>
    </Box>
  );
};
