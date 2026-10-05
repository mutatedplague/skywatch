import type { SourceName } from './types';

export interface SourceInfo {
  id: SourceName;
  name: string;
  /** What the operator has to have for this feed to work. */
  needs: string;
  blurb: string;
}

/** The feeds the receiver can poll, in the order the console offers them. */
export const SOURCE_INFO: readonly SourceInfo[] = [
  {
    id: 'dump1090',
    name: 'Your own receiver',
    needs: 'RTL-SDR dongle',
    blurb:
      'dump1090, readsb, PiAware or tar1090 on this machine or anywhere on your network. The best picture of your own sky, and the only feed that works offline.',
  },
  {
    id: 'adsblol',
    name: 'adsb.lol',
    needs: 'Nothing',
    blurb: 'Community network fed by hobbyist receivers. Free, no account, updated every two seconds.',
  },
  {
    id: 'airplaneslive',
    name: 'airplanes.live',
    needs: 'Nothing',
    blurb: 'Another community network with the same coverage model. Free, no account.',
  },
  {
    id: 'opensky',
    name: 'OpenSky Network',
    needs: 'Free account',
    blurb:
      'Research network. Anonymous access is throttled to one update every ten seconds; an API client from your account lifts that.',
  },
  {
    id: 'demo',
    name: 'Simulated traffic',
    needs: 'Nothing',
    blurb: 'Synthetic aircraft around your site. For trying the console, not for watching the sky.',
  },
];

export function sourceInfo(id: string): SourceInfo | undefined {
  return SOURCE_INFO.find((info) => info.id === id);
}
