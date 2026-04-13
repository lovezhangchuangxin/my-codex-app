import { translateEnglish } from '@/lib/i18n/catalog';

export function formatConnectionKind(
  kind: string,
  t: (key: string) => string = translateEnglish,
): string {
  switch (kind) {
    case 'authenticated':
      return t('connection.status.authenticated');
    case 'refreshing':
      return t('connection.status.refreshing');
    case 'reconnecting':
      return t('connection.status.reconnecting');
    case 'resyncing':
      return t('connection.status.resyncing');
    case 'disconnected':
      return t('connection.status.disconnected');
    case 'unpaired':
      return t('connection.status.unpaired');
    case 'expired':
      return t('connection.status.expired');
    case 'revoked':
      return t('connection.status.revoked');
    default:
      return kind;
  }
}
