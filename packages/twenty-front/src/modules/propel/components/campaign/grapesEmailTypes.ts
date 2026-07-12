// Shared prop/types contract for the GrapesJS email editor + its lazy wrapper.
// Kept in a TINY standalone module (no grapesjs imports) so BOTH the lightweight
// GrapesEmailBuilder wrapper and the heavy GrapesEmailEditor can import the types
// without the wrapper pulling in grapesjs.

import { type CustomFieldOption } from '@/propel/types/marketingHome';

// The template a session seeds from / saves back to. `id` present ⇒ editing an
// existing template (save = update); absent ⇒ a fresh design (save = create).
//
// `designProjectJson` is the stringified GrapesJS project JSON for EXACT
// re-editability. It is persisted on the marketingEmailTemplate object's
// `designProjectJson` RAW_JSON field (#59): the template editor sends it on save
// and the hub read seeds it back, so a saved design round-trips its exact node
// graph. Undefined only for templates saved HTML-only before the field existed —
// those re-open from the starter skeleton, same as before.
export type GrapesEmailTemplateSeed = {
  id?: string;
  name?: string;
  subject?: string;
  bodyText?: string;
  languageCode?: 'EN' | 'AR';
  designProjectJson?: string;
};

// `campaign`  — the editor rides inside the campaign builder; "Save as template"
//               is a secondary action (the campaign itself is the primary output).
// `template`  — the editor IS the template editor (marketing-hub Templates tab);
//               "Save template" is the primary action.
export type GrapesEmailEditorMode = 'campaign' | 'template';

export type GrapesEmailEditorProps = {
  mode: GrapesEmailEditorMode;
  // Seed an existing template (template edit) or a prefilled draft (campaign).
  initial?: GrapesEmailTemplateSeed | null;
  // Workspace saved-snippet merge tags, surfaced in the Insert-merge-tag menu.
  customFields?: CustomFieldOption[];
  // Called after a successful save-as-template with the saved template id.
  onSaved?: (emailTemplateId: string) => void;
  // Optional "Close" affordance (the Templates tab uses it to return to the grid).
  onClose?: () => void;
  // OPTIONAL — when provided (e.g. a sequence email STEP modal), the editor shows
  // a primary "Use this design" action that hands the COMPILED HTML back to the
  // caller on click. Purely additive: callers that don't pass it are unchanged.
  onApplyHtml?: (html: string) => void;
  // OPTIONAL — when provided, the editor is the EMBEDDED compose surface (the
  // one-message wizard's EMAIL Compose step). The design IS the content: the
  // compiled HTML is synced back continuously (debounced) on every edit, so there
  // is NO explicit apply button — the builder simply IS the email. Passing this
  // ALSO hides the "Use this design"/"Close" affordances (they don't apply when
  // embedded as the step itself). Additive; callers that don't pass it are
  // unchanged. The HTML is the cross-client MJML compile, same as Export.
  onHtmlChange?: (html: string) => void;
  // OPTIONAL — fired (debounced) with the GrapesJS project JSON alongside
  // onHtmlChange, so the embedding surface can persist a re-editable snapshot if a
  // place to store it exists. (No backing field today — see GrapesEmailTemplateSeed
  // — so the wizard ignores it for now; wired so the plumbing is ready.)
  onProjectChange?: (projectJson: string) => void;
  // OPTIONAL — hide the editor's own toolbar chrome (badge, MJML view, Export,
  // Save-as-template) when the embedding surface supplies its own controls. Used
  // by the embedded compose surface to keep the step clean (Subject + canvas).
  hideToolbar?: boolean;
  // OPTIONAL — grounding context for the in-builder AI co-pilot (#57). When
  // present, the co-pilot panel is shown and its requests are grounded against the
  // real campaign (objective + listing + segment + language) via the existing
  // /marketing/draft-copy route. Absent ⇒ no AI panel (e.g. the Templates tab,
  // which has no campaign context). Additive.
  aiContext?: GrapesEmailAiContext;
  // OPTIONAL — the co-pilot proposes a SUBJECT alongside body copy; this hands it
  // back to the embedding surface (the wizard owns the Subject field).
  onSubjectSuggested?: (subject: string) => void;
};

// Grounding context for the in-builder AI co-pilot. Mirrors the /marketing/draft-
// copy request inputs the wizard already computes, so the co-pilot reuses the live
// backend with the campaign's real objective/listing/segment.
export type GrapesEmailAiContext = {
  objective: 'PROMOTE_LISTING' | 'REACTIVATE_SEGMENT';
  language: 'EN' | 'AR';
  listingId?: string | null;
  segmentName?: string | null;
};

// The lazy wrapper (GrapesEmailBuilder) takes the same props as the editor it
// wraps. Aliased so the wrapper's prop type matches its component name (lint
// rule twenty/component-props-naming).
export type GrapesEmailBuilderProps = GrapesEmailEditorProps;
