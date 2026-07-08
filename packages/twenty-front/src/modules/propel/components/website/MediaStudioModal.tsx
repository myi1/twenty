import { useState } from 'react';
import { Button, Group, Modal, Text } from '@mantine/core';
import { IconPhoto } from 'twenty-ui/display';
import { MediaStudioBody } from '@/propel/components/website/MediaStudioBody';

// Media Studio MODAL — the in-editor host for the shared MediaStudioBody. This is
// the fullScreen workbench opened by every image field's "Change" button. It owns
// only the open/close state, the trigger button, and the header ("Inserting into ·
// <field>"); the panels (Library · Generate · Enhance · Project renders · Upload)
// all live in MediaStudioBody, shared with the standalone Marketing → Media Studio
// tab (MediaStudioTab).
//
// This host passes `onPick`, so the body offers "Use this image": it inserts the
// gatewayPath into the field and closes the modal. (The standalone tab omits
// `onPick`, so it shows no insert action — see MediaStudioBody.)

// Re-exported for back-compat: LandingPagesTab wraps its editor in this provider so
// every studio instance shares one "renders feature off" latch. It now lives in
// MediaStudioBody; this alias keeps the existing import path working.
export { ProjectAssetsProvider } from '@/propel/components/website/MediaStudioBody';

interface MediaStudioModalProps {
  sitePublicUrl: string;
  onPick: (gatewayPath: string) => void;
  // Shown in the header: "Inserting into · <field label>".
  fieldLabel: string;
  // Best-effort context for the AI guardrail (the page draft's title). Empty is
  // fine — the CRM route only shapes on a non-empty value.
  projectName?: string;
}

export const MediaStudioModal = ({
  sitePublicUrl,
  onPick,
  fieldLabel,
  projectName,
}: MediaStudioModalProps) => {
  const [opened, setOpened] = useState(false);
  const close = () => setOpened(false);

  return (
    <>
      <Button
        size="compact-xs"
        variant="light"
        color="red"
        leftSection={<IconPhoto size={14} />}
        onClick={() => setOpened(true)}
      >
        Change
      </Button>
      <Modal
        opened={opened}
        onClose={close}
        fullScreen
        zIndex={5000}
        padding="lg"
        withCloseButton
        title={
          <Group gap="sm" wrap="nowrap">
            <Text fw={700} size="lg">
              Media studio
            </Text>
            <Text size="sm" c="dimmed" truncate>
              Inserting into · {fieldLabel}
            </Text>
          </Group>
        }
      >
        <MediaStudioBody
          sitePublicUrl={sitePublicUrl}
          projectName={projectName}
          active={opened}
          onPick={(gatewayPath) => {
            onPick(gatewayPath);
            close();
          }}
        />
      </Modal>
    </>
  );
};

export default MediaStudioModal;
