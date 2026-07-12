// Types for the "Design in Canva" round-trip (Canva Connect API), mirroring the CRM
// app routes under /canva/* (propel-crm-integration src/logic-functions/canva-*).
//
// Each agent connects THEIR OWN Canva account via OAuth 2.0 + PKCE; they design in a
// new tab and the finished PNG flows back onto the post. Every route returns either an
// `ok` payload or the shared marketing error envelope ({ error, code, operatorAction }).

// The marketing-io error envelope (HTTP 200 with a code).
export interface CanvaEnvelopeError {
  error?: string;
  code?: string;
  operatorAction?: string;
}

// POST /canva/status → { configured, connected, displayName }. configured:false means
// the environment isn't set up for Canva yet (the founder hasn't registered the
// integration) → the composer shows a DISABLED "Connect your Canva account" state.
export interface CanvaStatusResponse extends CanvaEnvelopeError {
  ok?: boolean;
  configured?: boolean;
  connected?: boolean;
  displayName?: string | null;
}

// POST /canva/oauth/start → { authorizeUrl }. The composer opens this in a new tab to
// begin the OAuth connect; the callback finishes server-side and posts a message back.
export interface CanvaOauthStartResponse extends CanvaEnvelopeError {
  ok?: boolean;
  authorizeUrl?: string;
}

// POST /canva/design/create → { designId, editUrl }. editUrl is the temporary Canva
// edit URL the composer opens in a new tab.
export interface CanvaCreateResponse extends CanvaEnvelopeError {
  ok?: boolean;
  designId?: string;
  editUrl?: string;
  viewUrl?: string | null;
  seededImage?: boolean;
}

// POST /canva/design/export → { url }. url is the stored (signed B2) PNG link the
// composer swaps onto the post — the "image flows back" step.
export interface CanvaExportResponse extends CanvaEnvelopeError {
  ok?: boolean;
  url?: string;
  contentType?: string;
  designId?: string;
}

// Normalized status the composer renders the button from.
export type CanvaStatus =
  | { kind: 'loading' }
  | { kind: 'disabled' } // not configured on this environment
  | { kind: 'disconnected' }
  | { kind: 'connected'; displayName: string | null }
  | { kind: 'error'; message: string };
