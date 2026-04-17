import type { IncomingMessage } from 'node:http';

import {
  BridgeAuthError,
  type AuthenticatedBridgeSession,
  type BridgeAuthService,
} from './authService.js';

export function authenticateBridgeRequest(
  request: IncomingMessage,
  url: URL,
  authService: BridgeAuthService,
  options?: {
    allowQueryToken?: boolean;
  },
): AuthenticatedBridgeSession {
  const accessToken = getRequestAccessToken(
    request,
    url,
    options?.allowQueryToken ?? false,
  );
  if (!accessToken) {
    throw new BridgeAuthError(
      'Bridge credentials are missing',
      'missingCredentials',
      401,
    );
  }

  return authService.authenticateAccessToken(accessToken);
}

function getRequestAccessToken(
  request: IncomingMessage,
  url: URL,
  allowQueryToken: boolean,
): string | null {
  const authorizationHeader = request.headers.authorization;
  if (authorizationHeader?.startsWith('Bearer ')) {
    return authorizationHeader.slice('Bearer '.length);
  }

  return allowQueryToken ? url.searchParams.get('access_token') : null;
}
