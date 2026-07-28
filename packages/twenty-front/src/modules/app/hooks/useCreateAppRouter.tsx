import { AppRouterProviders } from '@/app/components/AppRouterProviders';
import { LazyRoute } from '@/app/components/LazyRoute';
import { SettingsRoutes } from '@/app/components/SettingsRoutes';
import { HeroRoute } from '@/propel/runtime/HeroRoute';
import {
  getAllNavEntries,
  getPropelNavConfig,
} from '@/propel/runtime/propelNavConfig';
import { VerifyLoginTokenEffect } from '@/auth/components/VerifyLoginTokenEffect';

import { VerifyEmailEffect } from '@/auth/components/VerifyEmailEffect';
import indexAppPath from '@/navigation/utils/indexAppPath';
import { BlankLayout } from '@/ui/layout/page/components/BlankLayout';
import { DefaultLayout } from '@/ui/layout/page/components/DefaultLayout';
import { AppPath } from 'twenty-shared/types';

import { lazy } from 'react';
import {
  createBrowserRouter,
  createRoutesFromElements,
  Route,
} from 'react-router-dom';

const RecordIndexPage = lazy(() =>
  import('~/pages/object-record/RecordIndexPage').then((module) => ({
    default: module.RecordIndexPage,
  })),
);

const RecordShowPage = lazy(() =>
  import('~/pages/object-record/RecordShowPage').then((module) => ({
    default: module.RecordShowPage,
  })),
);

const NotificationsPage = lazy(() =>
  import('~/pages/propel/NotificationsPage').then((module) => ({
    default: module.NotificationsPage,
  })),
);

// All Propel heroes are runtime-loaded via <HeroRoute name="…"/> — none of them
// ship in the app bundle. HeroRoute fetches each one from the /heroes volume at
// navigation time (see HeroRoute.tsx). Their ROUTES are also config-driven now: the
// route for each hero is registered by mapping over the runtime nav config
// (propelNavConfig.ts → DEFAULT_NAV_CONFIG, overridable by the host-mounted
// nav.config.json), so adding a hero in config wires its route too. Routes register
// UNCONDITIONALLY (every config entry, enabled or not) — a nav-hidden entry simply
// has no sidebar link but its route still resolves for deep-links, matching the
// prior hand-written behavior. The former in-bundle lazy() imports for
// MarketingHero / MarketingCampaignBuilderPage / SequenceEditorPage /
// OneOnOneRunnerPage / SocialCalendarPage / A2AStudioPage were removed when each
// graduated to runtime loading (listing-studio led; the others followed).

const SignInUp = lazy(() =>
  import('~/pages/auth/SignInUp').then((module) => ({
    default: module.SignInUp,
  })),
);

const PasswordReset = lazy(() =>
  import('~/pages/auth/PasswordReset').then((module) => ({
    default: module.PasswordReset,
  })),
);

const Authorize = lazy(() =>
  import('~/pages/auth/Authorize').then((module) => ({
    default: module.Authorize,
  })),
);

const CreateWorkspace = lazy(() =>
  import('~/pages/onboarding/CreateWorkspace').then((module) => ({
    default: module.CreateWorkspace,
  })),
);

const CreateProfile = lazy(() =>
  import('~/pages/onboarding/CreateProfile').then((module) => ({
    default: module.CreateProfile,
  })),
);

const SyncEmails = lazy(() =>
  import('~/pages/onboarding/SyncEmails').then((module) => ({
    default: module.SyncEmails,
  })),
);

const InviteTeam = lazy(() =>
  import('~/pages/onboarding/InviteTeam').then((module) => ({
    default: module.InviteTeam,
  })),
);

const ChooseYourPlan = lazy(() =>
  import('~/pages/onboarding/ChooseYourPlan').then((module) => ({
    default: module.ChooseYourPlan,
  })),
);

const PaymentSuccess = lazy(() =>
  import('~/pages/onboarding/PaymentSuccess').then((module) => ({
    default: module.PaymentSuccess,
  })),
);

const BookCallDecision = lazy(() =>
  import('~/pages/onboarding/BookCallDecision').then((module) => ({
    default: module.BookCallDecision,
  })),
);

const BookCall = lazy(() =>
  import('~/pages/onboarding/BookCall').then((module) => ({
    default: module.BookCall,
  })),
);

const StandalonePageLayoutPage = lazy(() =>
  import('~/pages/page-layout/StandalonePageLayoutPage').then((module) => ({
    default: module.StandalonePageLayoutPage,
  })),
);

const NotFound = lazy(() =>
  import('~/pages/not-found/NotFound').then((module) => ({
    default: module.NotFound,
  })),
);

export const useCreateAppRouter = (
  isFunctionSettingsEnabled?: boolean,
  isAdminPageEnabled?: boolean,
) =>
  createBrowserRouter(
    createRoutesFromElements(
      <Route
        element={<AppRouterProviders />}
        // To switch state to `loading` temporarily to enable us
        // to set scroll position before the page is rendered
        loader={async () => Promise.resolve(null)}
      >
        <Route element={<DefaultLayout />}>
          <Route path={AppPath.Verify} element={<VerifyLoginTokenEffect />} />
          <Route path={AppPath.VerifyEmail} element={<VerifyEmailEffect />} />
          <Route
            path={AppPath.SignInUp}
            element={
              <LazyRoute fallback={null}>
                <SignInUp />
              </LazyRoute>
            }
          />
          <Route
            path={AppPath.Invite}
            element={
              <LazyRoute fallback={null}>
                <SignInUp />
              </LazyRoute>
            }
          />
          <Route
            path={AppPath.ResetPassword}
            element={
              <LazyRoute fallback={null}>
                <PasswordReset />
              </LazyRoute>
            }
          />
          <Route
            path={AppPath.CreateWorkspace}
            element={
              <LazyRoute fallback={null}>
                <CreateWorkspace />
              </LazyRoute>
            }
          />
          <Route
            path={AppPath.CreateProfile}
            element={
              <LazyRoute fallback={null}>
                <CreateProfile />
              </LazyRoute>
            }
          />
          <Route
            path={AppPath.SyncEmails}
            element={
              <LazyRoute fallback={null}>
                <SyncEmails />
              </LazyRoute>
            }
          />
          <Route
            path={AppPath.InviteTeam}
            element={
              <LazyRoute fallback={null}>
                <InviteTeam />
              </LazyRoute>
            }
          />
          <Route
            path={AppPath.PlanRequired}
            element={
              <LazyRoute fallback={null}>
                <ChooseYourPlan />
              </LazyRoute>
            }
          />
          <Route
            path={AppPath.PlanRequiredSuccess}
            element={
              <LazyRoute fallback={null}>
                <PaymentSuccess />
              </LazyRoute>
            }
          />
          <Route
            path={AppPath.BookCallDecision}
            element={
              <LazyRoute fallback={null}>
                <BookCallDecision />
              </LazyRoute>
            }
          />
          <Route
            path={AppPath.BookCall}
            element={
              <LazyRoute fallback={null}>
                <BookCall />
              </LazyRoute>
            }
          />
          <Route path={indexAppPath.getIndexAppPath()} element={<></>} />
          <Route
            path={AppPath.RecordIndexPage}
            element={
              <LazyRoute>
                <RecordIndexPage />
              </LazyRoute>
            }
          />
          <Route
            path={AppPath.RecordShowPage}
            element={
              <LazyRoute>
                <RecordShowPage />
              </LazyRoute>
            }
          />
          {/* Propel: the full Notifications screen (bell "View all"). A plain
              bundled page, NOT a runtime-loaded hero — registered directly so it
              renders inside DefaultLayout's <Outlet/> (sidebar included) like any
              other page, with no /heroes volume dependency. */}
          <Route
            path="/notifications"
            element={
              <LazyRoute>
                <NotificationsPage />
              </LazyRoute>
            }
          />
          {/* Propel hero routes, config-driven (see comment above). Built from
              the nav config available synchronously at router-construction time
              (the baked default, which lists every known hero; a mounted
              nav.config.json that only RELABELS/REORDERS existing heroes needs no
              route change, and routes register unconditionally so nav-hidden
              entries still resolve for deep-links). */}
          {getAllNavEntries(getPropelNavConfig()).map((entry) => (
            <Route
              key={entry.key}
              path={entry.route}
              element={<HeroRoute name={entry.bundle} />}
            />
          ))}
          <Route
            path={AppPath.PageLayoutPage}
            element={
              <LazyRoute>
                <StandalonePageLayoutPage />
              </LazyRoute>
            }
          />
          <Route
            path={AppPath.SettingsCatchAll}
            element={
              <SettingsRoutes
                isFunctionSettingsEnabled={isFunctionSettingsEnabled}
                isAdminPageEnabled={isAdminPageEnabled}
              />
            }
          />
          <Route
            path={AppPath.NotFoundWildcard}
            element={
              <LazyRoute>
                <NotFound />
              </LazyRoute>
            }
          />
        </Route>
        <Route element={<BlankLayout />}>
          <Route
            path={AppPath.Authorize}
            element={
              <LazyRoute>
                <Authorize />
              </LazyRoute>
            }
          />
        </Route>
      </Route>,
    ),
  );
