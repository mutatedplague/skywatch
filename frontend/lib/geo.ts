/** Great-circle helpers for the console, mirroring backend/src/geo.ts. */

const EARTH_RADIUS_NM = 3440.065;

/** Range in nm and true bearing in degrees from one point to another. */
export function relative(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): { distance: number; bearing: number } {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const distance = 2 * EARTH_RADIUS_NM * Math.asin(Math.min(1, Math.sqrt(a)));

  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const y = Math.sin(dLon) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);
  const bearing = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;

  return { distance, bearing };
}
