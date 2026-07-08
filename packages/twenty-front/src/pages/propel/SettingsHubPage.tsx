import { Box, Tabs, Text } from '@mantine/core';
import { useState } from 'react';
import {
  IconAdjustments,
  IconBolt,
  IconGitBranch,
  IconMoon,
  IconSettings,
  IconUsers,
  IconWorld,
} from 'twenty-ui-deprecated/display';

import { PageContainer } from '@/ui/layout/page/components/PageContainer';
import { PageHeader } from '@/ui/layout/page/components/PageHeader';
import { PropelMantineProvider } from '@/propel/components/PropelMantineProvider';
import { SettingsAgentProfilesTab } from '@/propel/components/settings/SettingsAgentProfilesTab';
import { SettingsCustomFieldsTab } from '@/propel/components/settings/SettingsCustomFieldsTab';
import { SettingsLeadSourcesTab } from '@/propel/components/settings/SettingsLeadSourcesTab';
import { SettingsQuietHoursTab } from '@/propel/components/settings/SettingsQuietHoursTab';
import { SettingsSingletonConfigTab } from '@/propel/components/settings/SettingsSingletonConfigTab';

// The graduated Settings / Config Hub hero (#70). One polished in-place place a
// manager edits EVERY operational config — no developer, no raw record views, no
// in-sandbox front-component. Rides Twenty's DefaultLayout (nav + top bar from the
// router <Outlet/>); this page owns the header + the tabbed config surface, in its
// own Mantine scope.
//
// SUPERSEDES the app-side front-component (propel-crm-integration
// src/front-components/settings-hub.tsx) for the Settings surface. Each tab reuses
// the SAME, UNCHANGED gated CRM logic-function routes via callPropelRoute (no
// app-side schema or route change):
//   • Lead routing engine → /settings/automation-config (the brokerage-wide singleton)
//   • Lane automations     → /settings/automation-config (the 4 per-lane singletons)
//   • Agent profiles       → /lead/agent-profile
//   • Lead sources         → /lead/source-config (+ /seed)
//   • Quiet hours          → /marketing/hub (read) + /marketing/save-rules (write)
//   • Custom fields        → /settings/custom-fields
//
// Reads are open to any member (the surface renders); writes fail closed
// server-side for non-managers, so an agent sees the same surface read-only.

type TabKey =
  | 'routing'
  | 'lanes'
  | 'agents'
  | 'sources'
  | 'quiet'
  | 'fields';

export const SettingsHubPage = () => {
  const [tab, setTab] = useState<TabKey>('routing');

  return (
    <PropelMantineProvider>
      {/* Shared hero scroll fix: PageContainer claims full height; the body Box is
          the vertical scroll region (see MarketingHero / A2A for the root cause). */}
      <PageContainer style={{ flex: 1, minHeight: 0 }}>
        <PageHeader title="Settings" Icon={IconSettings} />

        <Box
          style={{
            padding: '12px 20px 32px',
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
          }}
        >
          <Box maw={980} mx="auto">
            <Text size="sm" c="dimmed" mb="lg" style={{ lineHeight: 1.5 }}>
              Everything the team runs on, editable in one place — no developer
              needed. Changes apply on the next lead or the next check; nothing here
              touches code.
            </Text>

            <Tabs
              value={tab}
              onChange={(v) => v && setTab(v as TabKey)}
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
      </PageContainer>
    </PropelMantineProvider>
  );
};
