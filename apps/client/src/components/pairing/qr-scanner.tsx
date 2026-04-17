import { useCallback } from 'react';
import { Scanner } from '@yudiel/react-qr-scanner';

import { normalizeBridgeBaseUrl } from '@/lib/runtime/bridge-target-store';

export interface QrScanResult {
  bridgeUrl: string;
  code: string;
}

interface QrScannerProps {
  onScan: (result: QrScanResult) => void;
  onError: (error: unknown) => void;
}

export function QrScanner({ onScan, onError }: QrScannerProps) {
  const handleScan = useCallback(
    (detectedCodes: { rawValue?: string }[]) => {
      const raw = detectedCodes[0]?.rawValue;
      if (!raw) return;

      const result = parsePairingPayload(raw);
      if (!result) {
        onError(new Error('Invalid QR code payload'));
        return;
      }

      onScan(result);
    },
    [onScan, onError],
  );

  return (
    <Scanner
      onScan={handleScan}
      onError={onError}
      constraints={{ facingMode: 'environment' }}
      formats={['qr_code']}
      scanDelay={500}
      styles={{
        container: { width: '100%' },
        video: {
          borderRadius: '0.5rem',
          objectFit: 'cover',
        },
      }}
    />
  );
}

function parsePairingPayload(raw: string): QrScanResult | null {
  const fields = new Map<string, string>();
  for (const segment of raw.trim().split(/[\r\n&]+/)) {
    const trimmed = segment.trim();
    if (trimmed.length === 0) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim().toLowerCase();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (!key || value.length === 0) {
      continue;
    }

    fields.set(key, value);
  }

  const bridgeUrl = normalizeBridgeBaseUrl(fields.get('bridge') ?? '');
  const code = fields.get('code')?.trim();
  if (!bridgeUrl || !code) {
    return null;
  }

  return {
    bridgeUrl,
    code,
  };
}
