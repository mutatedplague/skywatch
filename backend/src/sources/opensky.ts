import type { Config } from '../config.js';
import { boundingBox } from '../geo.js';
import type { RawAircraft } from '../types.js';
import { fetchJson } from './http.js';
import type { AdsbSource, SourceResult } from './index.js';

const TOKEN_URL =
  'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';
const STATES_URL = 'https://opensky-network.org/api/states/all';

const M_TO_FT = 3.28084;
const MS_TO_KT = 1.94384;
const MS_TO_FPM = 196.85;

/**
 * OpenSky returns state vectors as positional arrays:
 * [icao24, callsign, country, timePosition, lastContact, lon, lat, baroAlt,
 *  onGround, velocity, trueTrack, verticalRate, sensors, geoAlt, squawk, spi, posSource]
 */
function normalizeState(state: unknown[], now: number): RawAircraft | null {
  const hex = typeof state[0] === 'string' ? state[0].trim().toLowerCase() : '';
  const lon = typeof state[5] === 'number' ? state[5] : null;
  const lat = typeof state[6] === 'number' ? state[6] : null;
  if (!hex || lat === null || lon === null) return null;

  const onGround = state[8] === true;
  const baroAlt = typeof state[7] === 'number' ? state[7] : null;
  const geoAlt = typeof state[13] === 'number' ? state[13] : null;
  const velocity = typeof state[9] === 'number' ? state[9] : null;
  const track = typeof state[10] === 'number' ? state[10] : null;
  const verticalRate = typeof state[11] === 'number' ? state[11] : null;
  const lastContact = typeof state[4] === 'number' ? state[4] : null;
  const callsign = typeof state[1] === 'string' ? state[1].trim() : '';

  return {
    hex,
    flight: callsign === '' ? null : callsign,
    registration: null,
    type: null,
    lat,
    lon,
    altitude: onGround ? 0 : baroAlt === null ? null : Math.round(baroAlt * M_TO_FT),
    altitudeGeom: geoAlt === null ? null : Math.round(geoAlt * M_TO_FT),
    groundSpeed: velocity === null ? null : Math.round(velocity * MS_TO_KT),
    track,
    verticalRate: verticalRate === null ? null : Math.round(verticalRate * MS_TO_FPM),
    squawk: typeof state[14] === 'string' ? state[14] : null,
    category: null,
    onGround,
    rssi: null,
    seen: lastContact === null ? 0 : Math.max(0, now / 1000 - lastContact),
    military: false,
  };
}

export function openskySource(config: Config): AdsbSource {
  const box = boundingBox(config.lat, config.lon, config.rangeNm);
  const query = new URLSearchParams({
    lamin: box.lamin.toFixed(4),
    lomin: box.lomin.toFixed(4),
    lamax: box.lamax.toFixed(4),
    lomax: box.lomax.toFixed(4),
  });
  const url = `${STATES_URL}?${query.toString()}`;

  let token: string | null = null;
  let tokenExpiresAt = 0;

  /** OpenSky moved to OAuth2 client credentials; anonymous access is heavily throttled. */
  async function authHeaders(): Promise<Record<string, string>> {
    if (!config.openskyClientId || !config.openskyClientSecret) return {};
    if (token && Date.now() < tokenExpiresAt) return { authorization: `Bearer ${token}` };

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: config.openskyClientId,
      client_secret: config.openskyClientSecret,
    });
    const payload = (await fetchJson(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })) as { access_token?: string; expires_in?: number };

    if (!payload.access_token) throw new Error('OpenSky token response had no access_token');
    token = payload.access_token;
    // Refresh a minute early so an in-flight request never races the expiry.
    tokenExpiresAt = Date.now() + Math.max(60, (payload.expires_in ?? 1800) - 60) * 1000;
    return { authorization: `Bearer ${token}` };
  }

  return {
    name: 'opensky',
    label: config.openskyClientId ? 'OPENSKY OAUTH' : 'OPENSKY ANON',
    async fetchAircraft(): Promise<SourceResult> {
      const headers = await authHeaders();
      const payload = (await fetchJson(url, { headers }, 12000)) as { states?: unknown[][] | null };
      const now = Date.now();
      const aircraft: RawAircraft[] = [];
      for (const state of payload.states ?? []) {
        if (!Array.isArray(state)) continue;
        const normalized = normalizeState(state, now);
        if (normalized) aircraft.push(normalized);
      }
      return { aircraft, messages: null };
    },
  };
}
