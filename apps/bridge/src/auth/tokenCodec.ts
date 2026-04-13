import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export interface AccessTokenPayload {
  sub: string;
  sid: string;
  iat: number;
  exp: number;
}

export interface AccessTokenVerificationResult {
  payload: AccessTokenPayload;
  expired: boolean;
}

export function createSigningSecret(): string {
  return randomBytes(32).toString('base64url');
}

export function issueAccessToken(
  payload: AccessTokenPayload,
  secret: string,
): string {
  const encodedPayload = encodeSegment(JSON.stringify(payload));
  const signature = signPayload(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export function verifyAccessToken(
  token: string,
  secret: string,
  nowInSeconds: number,
): AccessTokenVerificationResult | null {
  const [encodedPayload, actualSignature] = token.split('.');
  if (!encodedPayload || !actualSignature) {
    return null;
  }

  const expectedSignature = signPayload(encodedPayload, secret);
  if (!safeEquals(actualSignature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(
      decodeSegment(encodedPayload),
    ) as Partial<AccessTokenPayload>;
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.sid !== 'string' ||
      typeof payload.iat !== 'number' ||
      typeof payload.exp !== 'number'
    ) {
      return null;
    }

    return {
      payload: {
        sub: payload.sub,
        sid: payload.sid,
        iat: payload.iat,
        exp: payload.exp,
      },
      expired: payload.exp <= nowInSeconds,
    };
  } catch {
    return null;
  }
}

function signPayload(encodedPayload: string, secret: string): string {
  return createHmac('sha256', secret).update(encodedPayload).digest('hex');
}

function encodeSegment(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function decodeSegment(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function safeEquals(left: string, right: string): boolean {
  return timingSafeEqual(Buffer.from(left), Buffer.from(right));
}
