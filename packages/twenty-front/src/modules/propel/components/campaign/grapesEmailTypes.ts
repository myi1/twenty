// Shared prop/types contract for the GrapesJS email editor + its lazy wrapper.
// Kept in a TINY standalone module (no grapesjs imports) so BOTH the lightweight
// GrapesEmailBuilder wrapper and the heavy GrapesEmailEditor can import the types
// without the wrapper pulling in grapesjs.

import { type CustomFieldOption } from '@/propel/types/marketingHome';

// The template a session seeds from / saves back to. `id` present ⇒ editing an
// existing template (save = update); absent ⇒ a fresh design (save = create).
//
// `designProjectJson` is the GrapesJS project JSON for EXACT re-editability. It is
// FORWARD-COMPAT: the marketingEmailTemplate object has no field to persist it yet
// (adding one is an app:install schema change, out of scope for the staging hero
// iteration), so today it is always undefined on load and we round-trip HTML only.
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
};

// The lazy wrapper (GrapesEmailBuilder) takes the same props as the editor it
// wraps. Aliased so the wrapper's prop type matches its component name (lint
// rule twenty/component-props-naming).
export type GrapesEmailBuilderProps = GrapesEmailEditorProps;
