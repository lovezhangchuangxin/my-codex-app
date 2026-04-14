import { useEffect, useState } from 'react';

import type { LocalConnectionState } from '@my-codex-app/protocol';

const BANNER_DELAY_MS = 1500;

export function useThreadDetailBanner(
  connectionState: LocalConnectionState,
  t: (key: string) => string,
) {
  const [visibleBanner, setVisibleBanner] =
    useState<ReturnType<typeof connectionBanner>>(null);

  useEffect(() => {
    const next = connectionBanner(connectionState, t);
    const timer = setTimeout(
      () => {
        setVisibleBanner(next);
      },
      next ? BANNER_DELAY_MS : 0,
    );

    return () => clearTimeout(timer);
  }, [connectionState, t]);

  return visibleBanner;
}

function connectionBanner(
  connectionState: LocalConnectionState,
  t: (key: string) => string,
): {
  message: string;
  title: string;
  tone: 'info' | 'error';
} | null {
  switch (connectionState.kind) {
    case 'authenticated':
      return null;
    case 'refreshing':
      return {
        title: t('detail.banner.refreshing.title'),
        message: t('detail.banner.refreshing.message'),
        tone: 'info',
      };
    case 'reconnecting':
      return {
        title: t('detail.banner.reconnecting.title'),
        message:
          connectionState.message ?? t('detail.banner.reconnecting.message'),
        tone: 'info',
      };
    case 'resyncing':
      return {
        title: t('detail.banner.resyncing.title'),
        message: t('detail.banner.resyncing.message'),
        tone: 'info',
      };
    case 'disconnected':
      return {
        title: t('detail.banner.disconnected.title'),
        message:
          connectionState.message ?? t('detail.banner.disconnected.message'),
        tone: 'error',
      };
    case 'revoked':
      return {
        title: t('detail.banner.revoked.title'),
        message: connectionState.message ?? t('detail.banner.revoked.message'),
        tone: 'error',
      };
    case 'expired':
      return {
        title: t('detail.banner.expired.title'),
        message: connectionState.message ?? t('detail.banner.expired.message'),
        tone: 'error',
      };
    case 'unpaired':
      return {
        title: t('detail.banner.unpaired.title'),
        message: t('detail.banner.unpaired.message'),
        tone: 'error',
      };
    case 'unreachable':
      return {
        title: t('detail.banner.unreachable.title'),
        message:
          connectionState.message ?? t('detail.banner.unreachable.message'),
        tone: 'error',
      };
  }
}
