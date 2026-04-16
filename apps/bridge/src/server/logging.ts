import { networkInterfaces } from 'node:os';
import type { PairingStatusResponse } from '@my-codex-app/protocol';
import QRCode from 'qrcode-terminal';

export function resolveBridgeQrUrl(host: string, port: number): string {
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

export function logPairingStatus(
  status: PairingStatusResponse & {
    pairingCode: string;
    regenerated?: boolean;
  },
  bridgeUrl?: string,
): void {
  if (status.regenerated) {
    console.log('Pairing code rotated.');
  }
  if (bridgeUrl) {
    const qrPayload = `${bridgeUrl}/pair?code=${status.pairingCode}`;
    console.log('\nScan QR code to pair your device:\n');
    QRCode.generate(qrPayload, { small: true }, (output) => {
      console.log(output);
    });
  }
  console.log(
    `Pairing code: ${status.pairingCode} (expires at ${new Date(status.expiresAt * 1000).toISOString()})`,
  );
}
