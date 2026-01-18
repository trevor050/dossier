export type TrackerPersistMode = 'localStorage' | 'cookie';

export function getTrackerConfig(): { endpoint: string | null; persist: TrackerPersistMode } {
  const endpointRaw = import.meta.env.VITE_TRACKER_ENDPOINT as string | undefined;
  const endpointValue = endpointRaw ? endpointRaw.trim() : '';
  const endpointLower = endpointValue.toLowerCase();
  const endpoint =
    endpointValue.length === 0
      ? '/api/collect'
      : endpointLower === 'off' || endpointLower === 'false' || endpointLower === 'disabled'
        ? null
        : endpointValue;
  const persistRaw = (import.meta.env.VITE_TRACKER_PERSIST as string | undefined) || 'localStorage';
  const persist: TrackerPersistMode = persistRaw === 'cookie' ? 'cookie' : 'localStorage';
  return { endpoint, persist };
}
