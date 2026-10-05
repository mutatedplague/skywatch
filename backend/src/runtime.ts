import { type Config, DEFAULT_POLL_MS, env, type SourceName } from './config.js';
import { currentSite } from './site.js';

/**
 * The live configuration. Static settings pass straight through from the
 * environment; the site, the feed and everything derived from them are read
 * fresh on every access, because the console can change them while we run.
 */
export const runtime: Config = {
  get port() {
    return env.port;
  },
  get host() {
    return env.host;
  },
  get site() {
    return currentSite().site;
  },
  /** Falls back to a spot over open water so a misconfigured deploy is obvious. */
  get lat() {
    return currentSite().lat ?? 0;
  },
  get lon() {
    return currentSite().lon ?? 0;
  },
  get rangeNm() {
    return currentSite().rangeNm;
  },
  /** Without a position there is nothing to measure from, so simulate instead. */
  get source(): SourceName {
    const site = currentSite();
    return site.positionSource === 'none' ? 'demo' : (site.source ?? env.requestedSource);
  },
  get simulated() {
    return this.source === 'demo';
  },
  get pollMs() {
    return env.pollMsOverride ?? DEFAULT_POLL_MS[this.source];
  },
  get alertRadiusNm() {
    return currentSite().alertRadiusNm;
  },
  get alertAltitudeFt() {
    return currentSite().alertAltitudeFt;
  },
  get staleSeconds() {
    return env.staleSeconds;
  },
  get dump1090Url() {
    return currentSite().dump1090Url ?? env.dump1090Url;
  },
  get openskyClientId() {
    return currentSite().openskyClientId ?? env.openskyClientId;
  },
  get openskyClientSecret() {
    return currentSite().openskyClientSecret ?? env.openskyClientSecret;
  },
  get corsOrigin() {
    return env.corsOrigin;
  },
};
