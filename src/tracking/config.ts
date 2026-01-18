export type TrackerPersistMode = 'localStorage' | 'cookie';

export function getTrackerConfig(): { endpoint: string; persist: TrackerPersistMode } {
  const endpoint = (import.meta.env.VITE_TRACKER_ENDPOINT as string | undefined) || '/api/collect';
  const persistRaw = (import.meta.env.VITE_TRACKER_PERSIST as string | undefined) || 'localStorage';
  const persist: TrackerPersistMode = persistRaw === 'cookie' ? 'cookie' : 'localStorage';
  return { endpoint, persist };
}

