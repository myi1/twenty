import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { PropelCallOnQueryParamEffect } from '@/dialer-dock/components/PropelCallOnQueryParamEffect';

// The real module reads `import.meta.env`, which this jest transform cannot parse.
// Placing calls is not what is under test here — reaching the login form is.
jest.mock('@/dialer-dock/utils/startPropelCall', () => ({
  startPropelCall: jest.fn(() => true),
}));

const PERSON_ID = '11111111-2222-4333-8444-555555555555';

// Regression cover for the 2026-08-06 sign-in lockout.
//
// This component is mounted globally in AppRouterProviders, so it renders on the
// signed-out routes too — and MinimalMetadataGater deliberately lets those routes
// through with an EMPTY object-metadata store. Resolving Person metadata there
// threw "Object metadata item \"person\" cannot be found in an array of 0
// elements", which the error boundary turned into a full-app error page: anyone
// arriving without a session (new joiner, new device, cleared browser, private
// window) could not reach the login form at all.
describe('PropelCallOnQueryParamEffect', () => {
  it('renders nothing, and does not throw, on a signed-out route with empty object metadata', () => {
    expect(() =>
      render(
        <MemoryRouter initialEntries={['/welcome']}>
          <PropelCallOnQueryParamEffect />
        </MemoryRouter>,
      ),
    ).not.toThrow();
  });

  it('stays inert when a call is requested before Person metadata has loaded', () => {
    const renderCallRoute = () =>
      render(
        <MemoryRouter initialEntries={[`/object/person/${PERSON_ID}?call=1`]}>
          <PropelCallOnQueryParamEffect />
        </MemoryRouter>,
      );

    expect(renderCallRoute).not.toThrow();
    expect(renderCallRoute().container).toBeEmptyDOMElement();
  });
});
