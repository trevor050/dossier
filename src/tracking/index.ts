import { getTrackerConfig, type TrackerPersistMode } from './config';
import { createTelemetryClient } from './telemetry';

export type InitDossierOptions = {
  endpoint?: string | null;
  persistVisitorId?: TrackerPersistMode;
  shouldIgnore?: () => boolean;
  installGlobalTracking?: boolean;
  installPagehideFlush?: boolean;
};

export function initDossier(options: InitDossierOptions = {}) {
  const config = getTrackerConfig();
  const endpoint = options.endpoint ?? config.endpoint;
  if (!endpoint) {
    return {
      telemetry: null,
      teardown: () => {},
    };
  }

  const telemetry = createTelemetryClient({
    endpoint,
    persistVisitorId: options.persistVisitorId ?? config.persist,
    shouldIgnore: options.shouldIgnore,
  });

  if (options.installGlobalTracking !== false) {
    telemetry.installGlobalTracking();
  }
  telemetry.ensureVisit();

  const onPagehide = () => {
    void telemetry.flush({ useBeacon: true });
  };

  const shouldInstallPagehide = options.installPagehideFlush !== false;
  if (shouldInstallPagehide) {
    window.addEventListener('pagehide', onPagehide, { passive: true });
  }

  return {
    telemetry,
    teardown: () => {
      if (shouldInstallPagehide) {
        window.removeEventListener('pagehide', onPagehide);
      }
    },
  };
}

export type { TelemetrySummary } from './telemetry';
