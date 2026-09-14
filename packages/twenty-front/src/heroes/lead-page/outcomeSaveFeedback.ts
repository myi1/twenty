import { errorText } from './leadApi';
import type { SaveOutcomeResponse } from './types';

const PARTIAL_WORDS: Record<string, string> = {
  note: 'the note was not saved',
  followUp: 'the follow-up was not created',
  outcome: 'the call outcome was not recorded',
  lastTouch: 'the last-touch time was not updated',
};

const partialWords = (codes: string[]): string =>
  codes.length > 0
    ? codes
        .map((code) => PARTIAL_WORDS[code] ?? 'something else was not saved')
        .join(', ')
    : 'some requested work did not finish';

export type OutcomeSaveFeedback = {
  // `saved` means enough work landed to refresh the page. It does not imply a
  // completed outcome: see the PARTIAL branch below.
  saved: boolean;
  // A stage change compounds an incomplete outcome, so it is only allowed after
  // a fully completed outcome save.
  canMoveSuggestedStage: boolean;
  tone: 'success' | 'warning';
  text: string;
};

/**
 * Translate the route's completion contract into one agent-facing statement.
 *
 * In particular, PARTIAL is not a generic failure: some work is durable, but
 * the agent must inspect the refreshed lead before taking another action.
 */
export const outcomeSaveFeedback = (
  response: SaveOutcomeResponse,
): OutcomeSaveFeedback => {
  if (
    response &&
    response.ok === false &&
    'state' in response &&
    response.state === 'PARTIAL'
  ) {
    return {
      saved: true,
      canMoveSuggestedStage: false,
      tone: 'warning',
      text: `Some work saved. Still pending: ${partialWords(response.partial)}. Reopen this lead and check it before changing anything else.`,
    };
  }

  if (response && response.ok === false) {
    if ('error' in response && response.error === 'DUPLICATE_REQUEST') {
      // The legacy route only emits this after the original completed request.
      // Keep the established refresh behavior, but never make a stage move from
      // a replay response whose current details we did not freshly save.
      return {
        saved: true,
        canMoveSuggestedStage: false,
        tone: 'success',
        text: errorText(response),
      };
    }
    return {
      saved: false,
      canMoveSuggestedStage: false,
      tone: 'warning',
      text: errorText(response),
    };
  }

  if (response?.ok) {
    return {
      saved: true,
      canMoveSuggestedStage: true,
      tone: 'success',
      text: 'Saved.',
    };
  }

  return {
    saved: false,
    canMoveSuggestedStage: false,
    tone: 'warning',
    text: errorText(response),
  };
};
