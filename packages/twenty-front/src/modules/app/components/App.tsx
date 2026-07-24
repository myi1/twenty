import { AppRouter } from '@/app/components/AppRouter';
import { ApolloDevLogEffect } from '@/debug/components/ApolloDevLogEffect';
import { DialerDock } from '@/dialer-dock/components/DialerDock';
import { WhatsAppDock } from '@/whatsapp-dock/components/WhatsAppDock';
import { AppErrorBoundary } from '@/error-handler/components/AppErrorBoundary';
import { AppRootErrorFallback } from '@/error-handler/components/AppRootErrorFallback';
import { ExceptionHandlerProvider } from '@/error-handler/components/ExceptionHandlerProvider';
import { SnackBarComponentInstanceContext } from '@/ui/feedback/snack-bar-manager/contexts/SnackBarComponentInstanceContext';
import { ClickOutsideListenerContext } from '@/ui/utilities/pointer-event/contexts/ClickOutsideListenerContext';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { jotaiStore } from '@/ui/utilities/state/jotai/jotaiStore';
import { Provider as JotaiProvider } from 'jotai';
import { HelmetProvider } from 'react-helmet-async';
import { IconsProvider } from 'twenty-ui/display';
import { initialI18nActivate } from '~/utils/i18n/initialI18nActivate';

initialI18nActivate();

export const App = () => {
  return (
    <JotaiProvider store={jotaiStore}>
      <AppErrorBoundary
        resetOnLocationChange={false}
        FallbackComponent={AppRootErrorFallback}
      >
        <I18nProvider i18n={i18n}>
          <ApolloDevLogEffect />
          <SnackBarComponentInstanceContext.Provider
            value={{ instanceId: 'snack-bar-manager' }}
          >
            <IconsProvider>
              <ExceptionHandlerProvider>
                <HelmetProvider>
                  <ClickOutsideListenerContext.Provider
                    value={{ excludedClickOutsideId: undefined }}
                  >
                    <AppRouter />
                    <DialerDock />
                    <WhatsAppDock />
                    {/* NOTE: the Quick Note launcher is a THIRD floating button in
                        this same bottom-right column, but it cannot be mounted here.
                        This tree sits OUTSIDE ApolloProvider (Apollo is provided
                        inside AppRouter, in AppRouterProviders), and Quick Note's
                        record picker uses Apollo — mounting it here threw an Apollo
                        invariant that took down the whole app. The two docks above
                        survive here only because they use fetch/localStorage, never
                        Apollo. Quick Note is mounted in AppRouterProviders instead. */}
                  </ClickOutsideListenerContext.Provider>
                </HelmetProvider>
              </ExceptionHandlerProvider>
            </IconsProvider>
          </SnackBarComponentInstanceContext.Provider>
        </I18nProvider>
      </AppErrorBoundary>
    </JotaiProvider>
  );
};
