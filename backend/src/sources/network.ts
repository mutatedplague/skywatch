import type { Config } from '../config.js';
import type { RawAircraft } from '../types.js';
import { fetchJson } from './http.js';
import { extractMessageCount, normalizeMany } from './readsb.js';
import type { AdsbSource, SourceResult } from './index.js';

/**
 * adsb.lol and airplanes.live both expose a community "point" endpoint:
 * /v2/point/{lat}/{lon}/{radiusNm}, returning readsb-shaped records.
 */
function pointSource(opts: {
  name: string;
  label: string;
  base: string;
  config: Config;
}): AdsbSource {
  const radius = Math.min(250, Math.round(opts.config.rangeNm));
  const url = `${opts.base}/v2/point/${opts.config.lat.toFixed(5)}/${opts.config.lon.toFixed(5)}/${radius}`;
  return {
    name: opts.name,
    label: opts.label,
    async fetchAircraft(): Promise<SourceResult> {
      const payload = await fetchJson(url);
      return { aircraft: normalizeMany(payload), messages: extractMessageCount(payload) };
    },
  };
}

export function adsbLolSource(config: Config): AdsbSource {
  return pointSource({
    name: 'adsblol',
    label: 'ADSB.LOL NET',
    base: 'https://api.adsb.lol',
    config,
  });
}

export function airplanesLiveSource(config: Config): AdsbSource {
  return pointSource({
    name: 'airplaneslive',
    label: 'AIRPLANES.LIVE',
    base: 'https://api.airplanes.live',
    config,
  });
}

/** A local dump1090-fa / readsb / tar1090 receiver on your own network. */
export function dump1090Source(config: Config): AdsbSource {
  return {
    name: 'dump1090',
    label: 'LOCAL SDR',
    async fetchAircraft(): Promise<SourceResult> {
      const payload = await fetchJson(config.dump1090Url, {}, 4000);
      const aircraft: RawAircraft[] = normalizeMany(payload);
      return { aircraft, messages: extractMessageCount(payload) };
    },
  };
}
