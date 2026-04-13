import type { PairingStatusResponse } from '@my-codex-app/protocol';

export function logPairingStatus(
  status: PairingStatusResponse & {
    pairingCode: string;
    regenerated?: boolean;
  },
): void {
  if (status.regenerated) {
    console.log('Pairing code rotated.');
  }
  console.log(
    `Pairing code: ${status.pairingCode} (expires at ${new Date(status.expiresAt * 1000).toISOString()})`,
  );
}
