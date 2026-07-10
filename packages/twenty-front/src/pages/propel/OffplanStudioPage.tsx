import { PropelMantineProvider } from '@/propel/components/PropelMantineProvider';
import { Title, Text, Stack } from '@mantine/core';

export function OffplanStudioPage() {
  return (
    <PropelMantineProvider>
      <Stack p="md">
        <Title order={2}>Off-Plan Studio</Title>
        <Text c="dimmed">Browse off-plan projects and generate a branded client pitch.</Text>
      </Stack>
    </PropelMantineProvider>
  );
}
