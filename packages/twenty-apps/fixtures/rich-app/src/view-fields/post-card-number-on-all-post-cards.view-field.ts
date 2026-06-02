import { defineViewField } from 'twenty-sdk/define';

import { ALL_POST_CARDS_VIEW_ID } from '../views/all-post-cards.view';

export const POST_CARD_NUMBER_VIEW_FIELD_UNIVERSAL_IDENTIFIER =
  'c1a2b3c4-0001-4a7b-8c9d-0e1f2a3b4c5d';

export default defineViewField({
  universalIdentifier: POST_CARD_NUMBER_VIEW_FIELD_UNIVERSAL_IDENTIFIER,
  viewUniversalIdentifier: ALL_POST_CARDS_VIEW_ID,
  fieldMetadataUniversalIdentifier: '7b57bd63-5a4c-46ca-9d52-42c8f02d1df6',
  position: 5,
  isVisible: true,
  size: 100,
});
