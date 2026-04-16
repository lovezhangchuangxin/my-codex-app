import { useCallback } from 'react';
import { Scanner } from '@yudiel/react-qr-scanner';

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

      try {
        const url = new URL(raw);
        const code = url.searchParams.get('code');
        if (!code || code.length === 0) {
          onError(new Error('Invalid QR code: missing pairing code'));
          return;
        }
        const bridgeUrl = `${url.protocol}//${url.host}`;
        onScan({ bridgeUrl, code });
      } catch {
        onError(new Error('Invalid QR code content'));
      }
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
