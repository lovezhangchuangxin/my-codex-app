import { randomUUID } from "node:crypto";

import type {
  BridgeAuthErrorCode,
  DeviceInfo,
  DeviceListResponse,
  DeviceRevokeResponse,
  PairingCompleteRequest,
  PairingCompleteResponse,
  PairingStatusResponse,
  SessionRefreshRequest,
  SessionRefreshResponse
} from "@my-codex-app/protocol";

import {
  createRefreshToken,
  DeviceTrustStore,
  generatePairingCode
} from "./deviceTrustStore";
import {
  issueAccessToken,
  verifyAccessToken,
  type AccessTokenPayload
} from "./tokenCodec";

const ACCESS_TOKEN_TTL_SECONDS = 10 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const PAIRING_CODE_TTL_SECONDS = 10 * 60;

export class BridgeAuthError extends Error {
  constructor(
    message: string,
    readonly code: BridgeAuthErrorCode,
    readonly statusCode: number
  ) {
    super(message);
  }
}

export interface AuthenticatedBridgeSession {
  deviceId: string;
  sessionId: string;
}

export class BridgeAuthService {
  constructor(private readonly store: DeviceTrustStore) {}

  getPairingStatus(): PairingStatusResponse & { pairingCode: string; regenerated: boolean } {
    const now = nowInSeconds();
    const current = this.store.getPairingChallenge();
    if (current.expiresAt > now) {
      return {
        pairingRequired: true,
        instructions: "Enter the pairing code shown in the bridge terminal.",
        expiresAt: current.expiresAt,
        pairingCode: current.code,
        regenerated: false
      };
    }

    const nextCode = generatePairingCode();
    const nextChallenge = {
      code: nextCode,
      issuedAt: now,
      expiresAt: now + PAIRING_CODE_TTL_SECONDS
    };
    this.store.setPairingChallenge(nextChallenge);
    return {
      pairingRequired: true,
      instructions: "Enter the pairing code shown in the bridge terminal.",
      expiresAt: nextChallenge.expiresAt,
      pairingCode: nextChallenge.code,
      regenerated: true
    };
  }

  completePairing(request: PairingCompleteRequest): PairingCompleteResponse {
    const device = sanitizeDeviceInfo(request.device);
    const now = nowInSeconds();
    if (this.store.hasDeviceId(device.deviceId)) {
      throw new BridgeAuthError(
        "Device identifier already exists; regenerate the local device draft and try again",
        "deviceIdConflict",
        409
      );
    }

    const code = request.code.trim().toUpperCase();
    if (!this.store.consumePairingChallenge(code, now)) {
      throw new BridgeAuthError("Invalid or expired pairing code", "invalidPairingCode", 401);
    }

    const refreshToken = createRefreshToken();
    const refreshTokenExpiresAt = now + REFRESH_TOKEN_TTL_SECONDS;
    const trustedDevice = this.store.createTrustedDevice(
      device,
      refreshToken,
      refreshTokenExpiresAt,
      now
    );
    return {
      device: trustedDevice,
      session: this.#issueSession(trustedDevice.deviceId, refreshToken, now)
    };
  }

  refreshSession(request: SessionRefreshRequest): SessionRefreshResponse {
    const now = nowInSeconds();
    const nextRefreshToken = createRefreshToken();
    const nextRefreshTokenExpiresAt = now + REFRESH_TOKEN_TTL_SECONDS;
    const rotation = this.store.rotateRefreshTokenIfMatches(
      request.deviceId,
      request.refreshToken,
      nextRefreshToken,
      nextRefreshTokenExpiresAt,
      now
    );
    switch (rotation.status) {
      case "notFound":
      case "mismatch":
        throw new BridgeAuthError("Refresh token is invalid", "invalidRefreshToken", 401);
      case "revoked":
        throw new BridgeAuthError("Device has been revoked", "revokedDevice", 401);
      case "expired":
        throw new BridgeAuthError("Refresh token has expired", "expiredRefreshToken", 401);
      case "ok":
        return {
          device: rotation.device,
          session: this.#issueSession(rotation.device.deviceId, nextRefreshToken, now)
        };
    }

    throw new Error("Unexpected refresh rotation result");
  }

  authenticateAccessToken(accessToken: string): AuthenticatedBridgeSession {
    const now = nowInSeconds();
    const verified = verifyAccessToken(accessToken, this.store.getSigningSecret(), now);
    if (!verified) {
      throw new BridgeAuthError("Access token is invalid", "invalidAccessToken", 401);
    }

    if (verified.expired) {
      throw new BridgeAuthError("Access token has expired", "expiredAccessToken", 401);
    }

    const device = this.store.getDevice(verified.payload.sub);
    if (!device) {
      throw new BridgeAuthError("Device is not trusted", "invalidAccessToken", 401);
    }
    if (device.revokedAt !== undefined) {
      throw new BridgeAuthError("Device has been revoked", "revokedDevice", 401);
    }

    this.store.markDeviceSeen(device.deviceId, now);
    return {
      deviceId: device.deviceId,
      sessionId: verified.payload.sid
    };
  }

  listDevices(): DeviceListResponse {
    return {
      devices: this.store.listDevices()
    };
  }

  revokeDevice(deviceId: string): DeviceRevokeResponse {
    const revoked = this.store.revokeDevice(deviceId, nowInSeconds());
    if (!revoked) {
      throw new BridgeAuthError("Unknown device", "invalidAccessToken", 404);
    }
    return {};
  }

  #issueSession(deviceId: string, refreshToken: string, now: number) {
    const payload: AccessTokenPayload = {
      sub: deviceId,
      sid: randomSessionId(),
      iat: now,
      exp: now + ACCESS_TOKEN_TTL_SECONDS
    };
    return {
      accessToken: issueAccessToken(payload, this.store.getSigningSecret()),
      accessTokenExpiresAt: payload.exp,
      refreshToken
    };
  }
}

function sanitizeDeviceInfo(device: DeviceInfo): DeviceInfo {
  const deviceId = device.deviceId.trim();
  const label = device.label.trim();
  const platform = device.platform.trim();

  if (!deviceId || !label || !platform) {
    throw new BridgeAuthError("Device metadata is invalid", "invalidPairingCode", 400);
  }

  return {
    deviceId,
    label: label.slice(0, 120),
    platform: platform.slice(0, 120)
  };
}

function randomSessionId(): string {
  return randomUUID();
}

function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
