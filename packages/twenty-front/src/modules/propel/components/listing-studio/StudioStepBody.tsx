import {
  type StudioDraft,
  type StudioFacts,
  type StudioLocation,
  type StudioPermit,
  type StudioPhoto,
  type StudioPublishResult,
  type StudioStep,
  type StudioWriteup,
} from '@/propel/types/listingStudio';
import { StudioIntakeStep } from '@/propel/components/listing-studio/StudioIntakeStep';
import { StudioDetailsStep } from '@/propel/components/listing-studio/StudioDetailsStep';
import { StudioPhotosStep } from '@/propel/components/listing-studio/StudioPhotosStep';
import { StudioWriteupStep } from '@/propel/components/listing-studio/StudioWriteupStep';
import { StudioPermitStep } from '@/propel/components/listing-studio/StudioPermitStep';
import { StudioPublishStep } from '@/propel/components/listing-studio/StudioPublishStep';

// The per-step body — routes the current step to its full surface. The shell
// (frame, rail, live PF preview, draft/resume) lives in ListingStudioPage; each
// step component owns its own form + side-effects and reports up via the patch
// handlers (facts/location/photos/writeup/permit/publish) so the draft autosaves and
// the live PF preview rebuilds.

export const StudioStepBody = ({
  step,
  draft,
  onPatch,
  onLocation,
  onPhotos,
  onWriteup,
  onPermit,
  onPublished,
  onGoToStep,
}: {
  step: StudioStep;
  draft: StudioDraft;
  onPatch: (patch: Partial<StudioFacts>) => void;
  onLocation: (loc: StudioLocation) => void;
  onPhotos: (photos: StudioPhoto[]) => void;
  onWriteup: (writeup: StudioWriteup) => void;
  onPermit: (permit: StudioPermit) => void;
  onPublished: (result: StudioPublishResult) => void;
  onGoToStep: (step: StudioStep) => void;
}) => {
  switch (step) {
    case 'intake':
      return (
        <StudioIntakeStep
          onCompletionDetected={(completion) => onPatch({ completionStatus: completion })}
          onSkipToDetails={() => onGoToStep('details')}
        />
      );
    case 'details':
      return (
        <StudioDetailsStep
          facts={draft.facts}
          location={draft.location}
          onPatch={onPatch}
          onLocation={onLocation}
        />
      );
    case 'photos':
      return <StudioPhotosStep photos={draft.photos ?? []} onPhotos={onPhotos} />;
    case 'writeup':
      return (
        <StudioWriteupStep
          facts={draft.facts}
          writeup={draft.writeup}
          onWriteup={onWriteup}
        />
      );
    case 'permit':
      return <StudioPermitStep permit={draft.permit} onPermit={onPermit} />;
    case 'publish':
      return <StudioPublishStep draft={draft} onPublished={onPublished} />;
    default:
      return null;
  }
};
