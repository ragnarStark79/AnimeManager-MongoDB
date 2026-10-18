import { MEDIA_TYPES, STATUS_LABELS } from '@animemanager/shared';

export function getWebMetadata() {
  return {
    appName: 'AnimeManager Web',
    mediaTypes: MEDIA_TYPES,
    labels: STATUS_LABELS,
    phase: 'Phase 01 - Foundation',
  };
}
