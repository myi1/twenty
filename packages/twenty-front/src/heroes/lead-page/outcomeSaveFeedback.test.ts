import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { outcomeSaveFeedback } from './outcomeSaveFeedback.ts';

describe('outcomeSaveFeedback', () => {
  it('does not claim a partially persisted outcome is complete or eligible for a stage move', () => {
    const feedback = outcomeSaveFeedback({
      ok: false,
      state: 'PARTIAL',
      noteId: 'note-1',
      followUpTaskId: null,
      callTaskId: 'call-1',
      suggestedStage: 'CONTACTED',
      partial: ['followUp', 'lastTouch'],
    });

    assert.deepEqual(feedback, {
      saved: true,
      canMoveSuggestedStage: false,
      tone: 'warning',
      text: 'Some work saved. Still pending: the follow-up was not created, the last-touch time was not updated. Reopen this lead and check it before changing anything else.',
    });
  });

  it('tells an agent to reopen and check a conflicting request id instead of retrying it', () => {
    assert.deepEqual(
      outcomeSaveFeedback({ ok: false, error: 'REQUEST_ID_CONFLICT' }),
      {
        saved: false,
        canMoveSuggestedStage: false,
        tone: 'warning',
        text: 'This request was already used for different details. Reopen this lead and check it before changing anything else.',
      },
    );
  });
});
