import { Box, List, Paper, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { IconLayoutGrid, IconSparkles } from 'twenty-ui/display';

// Landing pages sub-tab (WEBSITE-REBUILD-DESIGN.md §6-7).
//
// HONEST STATE (2026-07-08): the page builder is NOT built yet. The earlier
// wave shipped a mock gallery + a GrapesJS-backed editor stub — but the heavy
// GrapesJS editor cannot load inside the runtime hero bundle (no async chunk
// loading), so mounting it crashed the whole Marketing screen. Rather than ship
// a broken/mock surface, this tab now states plainly that the builder is
// upcoming. When the page builder lands it replaces this component wholesale.
export const LandingPagesTab = () => {
  return (
    <Box p="md">
      <Stack align="center" justify="center" gap="lg" mih={360} maw={560} mx="auto">
        <ThemeIcon size={56} radius="xl" variant="light" color="gray">
          <IconLayoutGrid size={28} />
        </ThemeIcon>

        <Stack align="center" gap={6}>
          <Title order={4} ta="center">
            Landing page builder — coming soon
          </Title>
          <Text c="dimmed" size="sm" ta="center">
            A place to spin up campaign landing pages — from a prompt or a
            template — and see each one&apos;s real visits, leads and conversion
            rate. It isn&apos;t built yet; this is a placeholder so the tab is
            honest rather than a mock-up.
          </Text>
        </Stack>

        <Paper withBorder radius="md" p="md" w="100%">
          <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb="xs">
            What it will do
          </Text>
          <List
            spacing="xs"
            size="sm"
            c="dimmed"
            icon={
              <ThemeIcon size={18} radius="xl" variant="light" color="blue">
                <IconSparkles size={12} />
              </ThemeIcon>
            }
          >
            <List.Item>
              Generate a landing page draft from a plain-language prompt.
            </List.Item>
            <List.Item>
              Start from templates that show their real conversion rates.
            </List.Item>
            <List.Item>
              Assemble sections in a visual editor, then publish to the site.
            </List.Item>
            <List.Item>
              Track visits, captured leads and conversion per page.
            </List.Item>
          </List>
        </Paper>
      </Stack>
    </Box>
  );
};

export default LandingPagesTab;
