import { networkInterfaces } from 'node:os';
import type { PairingStatusResponse } from '@my-codex-app/protocol';
import QRCode from 'qrcode-terminal';

export function resolveBridgeQrUrl(
  host: string,
  port: number,
  bridgeUrl?: string,
): string {
  if (bridgeUrl && bridgeUrl.trim().length > 0) {
    return bridgeUrl.trim();
  }

  const qrHost =
    host === '0.0.0.0' || host === '::' ? (detectLanIp() ?? 'localhost') : host;
  return `http://${qrHost}:${port}`;
}

function detectLanIp(): string | undefined {
  const interfaces = networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.family === 'IPv4' && !entry.internal) {
        return entry.address;
      }
    }
  }
  return undefined;
}

export function createPairingPayload(
  bridgeUrl: string,
  pairingCode: string,
): string {
  return `bridge=${bridgeUrl}\ncode=${pairingCode}`;
}

export function renderPairingStatus(
  status: PairingStatusResponse & {
    pairingCode: string;
    regenerated?: boolean;
  },
  bridgeUrl: string,
): void {
  if (status.regenerated) {
    console.log('Pairing code rotated.');
  }
  const qrPayload = createPairingPayload(bridgeUrl, status.pairingCode);
  console.log(`Bridge URL: ${bridgeUrl}`);
  console.log(
    `Pairing code: ${status.pairingCode} (expires at ${new Date(status.expiresAt * 1000).toISOString()})`,
  );
  console.log('\nScan QR code to pair your device:\n');
  QRCode.generate(qrPayload, { small: true }, (output) => {
    console.log(output);
  });
  console.log(`QR payload:\n${qrPayload}`);
}
