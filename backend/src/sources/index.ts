import type { Config } from '../config.js';
import type { RawAircraft } from '../types.js';
import { demoSource } from './demo.js';
import { adsbLolSource, airplanesLiveSource, dump1090Source } from './network.js';
import { openskySource } from './opensky.js';

export interface SourceResult {
  aircraft: RawAircraft[];
  /** Cumulative message counter, when the feed publishes one. */
  messages: number | null;
}

export interface AdsbSource {
  name: string;
  /** Short label shown on the console status rail. */
  label: string;
  fetchAircraft(): Promise<SourceResult>;
}

export function createSource(config: Config): AdsbSource {
  switch (config.source) {
    case 'dump1090':
      return dump1090Source(config);
    case 'adsblol':
      return adsbLolSource(config);
    case 'airplaneslive':
      return airplanesLiveSource(config);
    case 'opensky':
      return openskySource(config);
    case 'demo':
    default:
      return demoSource(config);
  }
}
