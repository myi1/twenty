import { type ComponentInstanceStateContext } from '@/ui/utilities/state/component-state/types/ComponentInstanceStateContext';

declare global {
  interface Window {
    _env_?: Record<string, string>;
    // Propel runtime-loaded heroes: the host's shared singletons (React, Mantine,
    // twenty-ui ThemeContext, callPropelRoute, …), keyed by bare specifier. Populated
    // by @/propel/runtime/heroShared before the React tree mounts; read by the
    // /propel-shims/* re-export shims a runtime-loaded hero's bare imports resolve to.
    __propelShared?: Record<string, unknown>;
    __APOLLO_CLIENT__?: any;
    grecaptcha?: any;
    turnstile?: any;
    componentComponentStateContextMap: Map<
      string,
      ComponentInstanceStateContext<any>
    >;
    FrontChat?: (method: string, ...args: any[]) => void;
  }
}
