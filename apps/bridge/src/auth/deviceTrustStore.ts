import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import type { DeviceInfo, DeviceTrustRecord } from "@my-codex-app/protocol";

import { createSigningSecret } from "./tokenCodec.js";

interface StoredPairingChallenge {
  code: string;
  expiresAt: number;
  issuedAt: number;
}

interface StoredTrustedDevice extends DeviceTrustRecord {
  refreshTokenHash: string;
  refreshTokenExpiresAt: number;
}

interface BridgeAuthState {
  version: 1;
  signingSecret: string;
  pairingChallenge: StoredPairingChallenge;
  devices: StoredTrustedDevice[];
}

export interface RefreshSessionRecord {
  device: StoredTrustedDevice;
  refreshTokenHash: string;
  refreshTokenExpiresAt: number;
}

export type RefreshRotationResult =
  | { status: "notFound" }
  | { status: "revoked" }
  | { status: "mismatch" }
  | { status: "expired" }
  | { status: "ok"; device: DeviceTrustRecord };

export class DeviceTrustStore {
  readonly #statePath: string;
  #state: BridgeAuthState;

  constructor(statePath: string) {
    this.#statePath = statePath;
    this.#state = this.#load();
  }

  getSigningSecret(): string {
    return this.#state.signingSecret;
  }

  getPairingChallenge(): StoredPairingChallenge {
    return { ...this.#state.pairingChallenge };
  }

  setPairingChallenge(challenge: StoredPairingChallenge): void {
    this.#state = {
      ...this.#state,
      pairingChallenge: challenge
    };
    this.#save();
  }

  listDevices(): DeviceTrustRecord[] {
    return [...this.#state.devices]
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .map((device) => this.#toDeviceTrustRecord(device));
  }

  getDevice(deviceId: string): StoredTrustedDevice | null {
    const device = this.#state.devices.find((entry) => entry.deviceId === deviceId);
    return device ? { ...device } : null;
  }

  getActiveDevice(deviceId: string): StoredTrustedDevice | null {
    const device = this.getDevice(deviceId);
    return device && device.revokedAt === undefined ? device : null;
  }

  hasDeviceId(deviceId: string): boolean {
    return this.#state.devices.some((entry) => entry.deviceId === deviceId);
  }

  createTrustedDevice(
    deviceInfo: DeviceInfo,
    refreshToken: string,
    refreshTokenExpiresAt: number,
    nowInSeconds: number
  ): DeviceTrustRecord {
    if (this.hasDeviceId(deviceInfo.deviceId)) {
      throw new Error(`Device ${deviceInfo.deviceId} already exists`);
    }

    const refreshTokenHash = hashToken(refreshToken);
    const nextDevice: StoredTrustedDevice = {
      deviceId: deviceInfo.deviceId,
      label: deviceInfo.label,
      platform: deviceInfo.platform,
      createdAt: nowInSeconds,
      updatedAt: nowInSeconds,
      lastSeenAt: nowInSeconds,
      refreshTokenHash,
      refreshTokenExpiresAt
    };

    this.#state = {
      ...this.#state,
      devices: [...this.#state.devices, nextDevice]
    };
    this.#save();
    return this.#toDeviceTrustRecord(nextDevice);
  }

  consumePairingChallenge(code: string, nowInSeconds: number): boolean {
    const current = this.#state.pairingChallenge;
    if (current.expiresAt <= nowInSeconds || current.code !== code) {
      return false;
    }

    this.#state = {
      ...this.#state,
      pairingChallenge: {
        code: generatePairingCode(),
        issuedAt: nowInSeconds,
        expiresAt: nowInSeconds + 10 * 60
      }
    };
    this.#save();
    return true;
  }

  rotateRefreshTokenIfMatches(
    deviceId: string,
    presentedRefreshToken: string,
    nextRefreshToken: string,
    nextRefreshTokenExpiresAt: number,
    nowInSeconds: number
  ): RefreshRotationResult {
    const current = this.getDevice(deviceId);
    if (!current) {
      return { status: "notFound" };
    }

    if (current.revokedAt !== undefined) {
      return { status: "revoked" };
    }

    if (current.refreshTokenExpiresAt <= nowInSeconds) {
      return { status: "expired" };
    }

    if (current.refreshTokenHash !== hashToken(presentedRefreshToken)) {
      return { status: "mismatch" };
    }

    const nextDevice: StoredTrustedDevice = {
      ...current,
      updatedAt: nowInSeconds,
      lastSeenAt: nowInSeconds,
      refreshTokenHash: hashToken(nextRefreshToken),
      refreshTokenExpiresAt: nextRefreshTokenExpiresAt
    };

    this.#state = {
      ...this.#state,
      devices: [
        ...this.#state.devices.filter((entry) => entry.deviceId !== deviceId),
        nextDevice
      ]
    };
    this.#save();
    return {
      status: "ok",
      device: this.#toDeviceTrustRecord(nextDevice)
    };
  }

  markDeviceSeen(deviceId: string, nowInSeconds: number): DeviceTrustRecord | null {
    const device = this.getActiveDevice(deviceId);
    if (!device) {
      return null;
    }

    const nextDevice: StoredTrustedDevice = {
      ...device,
      updatedAt: nowInSeconds,
      lastSeenAt: nowInSeconds
    };

    this.#state = {
      ...this.#state,
      devices: [
        ...this.#state.devices.filter((entry) => entry.deviceId !== deviceId),
        nextDevice
      ]
    };
    this.#save();
    return this.#toDeviceTrustRecord(nextDevice);
  }

  revokeDevice(deviceId: string, nowInSeconds: number): DeviceTrustRecord | null {
    const device = this.getDevice(deviceId);
    if (!device) {
      return null;
    }

    const nextDevice: StoredTrustedDevice = {
      ...device,
      updatedAt: nowInSeconds,
      lastSeenAt: nowInSeconds,
      revokedAt: nowInSeconds
    };

    this.#state = {
      ...this.#state,
      devices: [
        ...this.#state.devices.filter((entry) => entry.deviceId !== deviceId),
        nextDevice
      ]
    };
    this.#save();
    return this.#toDeviceTrustRecord(nextDevice);
  }

  #load(): BridgeAuthState {
    if (!existsSync(this.#statePath)) {
      const initialState = createInitialState();
      this.#writeState(initialState);
      return initialState;
    }

    const raw = readFileSync(this.#statePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<BridgeAuthState>;
    if (
      parsed.version !== 1 ||
      typeof parsed.signingSecret !== "string" ||
      !parsed.pairingChallenge ||
      !Array.isArray(parsed.devices)
    ) {
      throw new Error(`Invalid bridge auth state at ${this.#statePath}`);
    }

    return {
      version: 1,
      signingSecret: parsed.signingSecret,
      pairingChallenge: parsed.pairingChallenge,
      devices: parsed.devices as StoredTrustedDevice[]
    };
  }

  #save(): void {
    this.#writeState(this.#state);
  }

  #writeState(state: BridgeAuthState): void {
    mkdirSync(dirname(this.#statePath), { recursive: true });
    writeFileSync(this.#statePath, JSON.stringify(state, null, 2));
  }

  #toDeviceTrustRecord(device: StoredTrustedDevice): DeviceTrustRecord {
    return {
      deviceId: device.deviceId,
      label: device.label,
      platform: device.platform,
      createdAt: device.createdAt,
      updatedAt: device.updatedAt,
      lastSeenAt: device.lastSeenAt,
      ...(device.revokedAt !== undefined ? { revokedAt: device.revokedAt } : {})
    };
  }
}

export function createRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function createInitialState(): BridgeAuthState {
  const now = nowInSeconds();
  return {
    version: 1,
    signingSecret: createSigningSecret(),
    pairingChallenge: {
      code: generatePairingCode(),
      issuedAt: now,
      expiresAt: now + 10 * 60
    },
    devices: []
  };
}

export function generatePairingCode(): string {
  return randomBytes(4).toString("hex").slice(0, 6).toUpperCase();
}

function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
