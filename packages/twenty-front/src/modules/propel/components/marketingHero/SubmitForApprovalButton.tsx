import { useState } from 'react';
import { Button } from '@mantine/core';
import { IconClock, IconSend } from 'twenty-ui/display';
import { usePropelToast } from '@/propel/hooks/usePropelToast';
import { useBrass } from '@/propel/components/marketingHero/deskShared';
import {
  submitForApproval,
  type SubmitKind,
} from '@/propel/lib/marketingApprovals';

// The maker-side go-live control (maker-checker Phase 2, UI leg). Wherever a
// publisher sees "Set live / Approve / Send", a non-publisher (agent) sees THIS in
// the same spot: one click routes to submitForApproval(kind, id) instead of
// publishing, and the control then reads "Submitted · awaiting a manager"
// (disabled). Agents keep full create/edit/draft use — only the go-live control
// swaps.
//
// The gate is BACKEND-enforced, so this is convenience, not the gate: it can never
// publish, it locks while a submit is in flight AND once submitted (no
// double-submit), and it degrades gracefully — a failed submit just toasts the
// reason and stays clickable. Callers that already know the item is pending
// (item.submittedForApprovalAt set) pass `alreadySubmitted` so the control opens in
// the disabled "Submitted" state without a click.
export const SubmitForApprovalButton = ({
  kind,
  id,
  resolveId,
  alreadySubmitted = false,
  onSubmitted,
  size = 'sm',
  fullWidth = false,
  disabled = false,
  submitLabel = 'Submit for approval',
  iconSize = 14,
}: {
  kind: SubmitKind;
  /** null → nothing to submit yet (the control is disabled) unless resolveId is set. */
  id: string | null;
  /**
   * Optional async id resolver — used where the item must be persisted first (e.g.
   * a dirty/new landing page in the editor). Called on click; returns the id to
   * submit, or null to abort (the resolver surfaces its own error). Takes
   * precedence over `id`.
   */
  resolveId?: () => Promise<string | null>;
  /** The item already carries submittedForApprovalAt → open disabled. */
  alreadySubmitted?: boolean;
  /** Fired after a successful submit so the parent can reload its projection. */
  onSubmitted?: () => void;
  size?: string;
  fullWidth?: boolean;
  disabled?: boolean;
  submitLabel?: string;
  iconSize?: number;
}) => {
  const notify = usePropelToast();
  const brass = useBrass();
  const [submitting, setSubmitting] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);

  const submitted = alreadySubmitted || justSubmitted;

  const submit = async () => {
    if (submitting || submitted) return;
    setSubmitting(true);
    const submitId = resolveId ? await resolveId() : id;
    if (submitId === null || submitId === '') {
      // resolveId aborted (it surfaced its own reason) or there is no id.
      setSubmitting(false);
      return;
    }
    const res = await submitForApproval(kind, submitId);
    setSubmitting(false);
    if (res.ok) {
      setJustSubmitted(true);
      notify('Submitted — a manager will review it before it goes live.', 'success');
      onSubmitted?.();
    } else {
      notify(res.error, 'error');
    }
  };

  if (submitted) {
    return (
      <Button
        size={size}
        fullWidth={fullWidth}
        variant="light"
        color="gray"
        leftSection={<IconClock size={iconSize} />}
        disabled
      >
        Submitted · awaiting a manager
      </Button>
    );
  }

  return (
    <Button
      size={size}
      fullWidth={fullWidth}
      variant="light"
      leftSection={<IconSend size={iconSize} />}
      loading={submitting}
      disabled={disabled || (id === null && resolveId === undefined)}
      onClick={() => void submit()}
      styles={{
        root: {
          color: brass,
          backgroundColor: `${brass}1F`,
          borderColor: `${brass}55`,
        },
      }}
    >
      {submitLabel}
    </Button>
  );
};

export default SubmitForApprovalButton;
