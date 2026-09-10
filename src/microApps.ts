import { registerMicroApps, start } from 'qiankun';
import type { RuntimeContext } from '@sure-zzzzzz/simple-frontend-contract';
import { portalRequest, redirectToLogin } from './api/portalAuth';
import { getThemeSnapshot, loadCurrentUser, portalState, refreshUnreadCount, themeSubscription, type PortalThemeSnapshot } from './portalState';

let started = false;

export interface PortalMicroAppProps extends RuntimeContext {
  getCurrentUser: () => typeof portalState.currentUser;
  currentUser: typeof portalState.currentUser;
  refreshCurrentUser: typeof loadCurrentUser;
  refreshUnreadCount: typeof refreshUnreadCount;
  onUnauthorized: typeof redirectToLogin;
  routePrefix: string;
  themeSnapshot: PortalThemeSnapshot;
  theme: typeof themeSubscription;
}

const runtimeRequest: NonNullable<RuntimeContext['request']> = {
  request<TResponse>({ method, path, body, signal }: Parameters<NonNullable<RuntimeContext['request']>['request']>[0]) {
    return portalRequest<TResponse>(path, {
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal
    });
  }
};

export function createPortalMicroAppProps(routePrefix: string): PortalMicroAppProps {
  return {
    request: runtimeRequest,
    getCurrentUser: () => portalState.currentUser,
    get currentUser() {
      return portalState.currentUser;
    },
    refreshCurrentUser: loadCurrentUser,
    refreshUnreadCount,
    onUnauthorized: redirectToLogin,
    routePrefix,
    themeSnapshot: getThemeSnapshot(),
    theme: themeSubscription
  };
}

export function setupMicroApps() {
  if (started || portalState.applications.length === 0) {
    return;
  }
  registerMicroApps(portalState.applications.map(application => ({
    name: application.applicationCode,
    entry: application.entry,
    container: '#micro-app-container',
    activeRule: application.routePrefix,
    props: {
      ...createPortalMicroAppProps(application.routePrefix),
      apiBase: application.apiBase
    }
  })));
  start({
    sandbox: {
      experimentalStyleIsolation: true
    }
  });
  started = true;
}
