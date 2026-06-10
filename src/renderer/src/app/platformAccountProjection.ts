import type { PlatformAccountProjection } from '@limecloud/desktop-platform-react';
import type { BuguAuthState } from '../../../shared/types';

export function createPlatformAccountProjection(authState: BuguAuthState | null): PlatformAccountProjection {
  const bootstrap = authState?.bootstrap;
  const user = authState?.user ?? bootstrap?.user;
  const tenantName =
    bootstrap?.tenant?.name ??
    bootstrap?.tenant?.slug ??
    user?.displayName ??
    user?.username;

  return {
    oauthState: authState?.authenticated ? 'authenticated' : 'unauthenticated',
    tenantName,
    accountEmail: user?.email ?? user?.username,
  };
}
