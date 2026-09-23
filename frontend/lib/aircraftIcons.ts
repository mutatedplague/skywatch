import type { Aircraft } from './types';

/**
 * Aircraft silhouettes from the ADS-B Radar free icon set (see NOTICE.md).
 * Resolution order: exact ICAO type designator, then type family, then the
 * ADS-B emitter category, which the icon set is already named after.
 */

/** Exact ICAO type designator to icon file. */
const BY_TYPE: Record<string, string> = {
  // Airbus narrowbody
  A19N: 'a320', A20N: 'a320', A21N: 'a320', A318: 'a320', A319: 'a320', A320: 'a320', A321: 'a320',
  // Airbus widebody
  A306: 'a330', A30B: 'a330', A310: 'a330', A332: 'a330', A333: 'a330', A337: 'a330', A338: 'a330',
  A339: 'a330', A359: 'a330', A35K: 'a330', A351: 'a330',
  A342: 'a340', A343: 'a340', A345: 'a340', A346: 'a340',
  A388: 'a380',
  // Boeing narrowbody
  B731: 'b737', B732: 'b737', B733: 'b737', B734: 'b737', B735: 'b737', B736: 'b737', B737: 'b737',
  B738: 'b737', B739: 'b737', B37M: 'b737', B38M: 'b737', B39M: 'b737', B3XM: 'b737',
  B752: 'b767', B753: 'b767',
  // Boeing widebody
  B741: 'b747', B742: 'b747', B743: 'b747', B744: 'b747', B748: 'b747', B74S: 'b747', BLCF: 'b747',
  B762: 'b767', B763: 'b767', B764: 'b767',
  B772: 'b777', B773: 'b777', B77L: 'b777', B77W: 'b777', B778: 'b777', B779: 'b777',
  B788: 'b787', B789: 'b787', B78X: 'b787',
  // Trijets and MD family
  MD11: 'md11', MD82: 'md11', MD83: 'md11', MD87: 'md11', MD88: 'md11', MD90: 'md11',
  B712: 'md11', DC10: 'md11', L101: 'md11',
  // Regional jets and turboprops
  CRJ1: 'crjx', CRJ2: 'crjx', CRJ7: 'crjx', CRJ9: 'crjx', CRJX: 'crjx',
  E135: 'erj', E145: 'erj', E45X: 'erj', E170: 'erj', E175: 'erj', E75L: 'erj', E75S: 'erj',
  E190: 'e195', E195: 'e195', E290: 'e195', E295: 'e195', E39L: 'e195',
  DH8A: 'dh8a', DH8B: 'dh8a', DH8C: 'dh8a', DH8D: 'dh8a', AT43: 'dh8a', AT45: 'dh8a',
  AT72: 'dh8a', AT75: 'dh8a', AT76: 'dh8a', SF34: 'dh8a', B190: 'dh8a', SW4: 'dh8a',
  F100: 'f100', F70: 'f100', F28: 'f100',
  // Business jets
  FA7X: 'fa7x', FA8X: 'fa7x', FA50: 'fa7x', F2TH: 'fa7x', F900: 'fa7x',
  GLF3: 'glf5', GLF4: 'glf5', GLF5: 'glf5', GLF6: 'glf5', GL5T: 'glf5', GLEX: 'glf5',
  CL30: 'glf5', CL35: 'glf5', CL60: 'glf5', CL600: 'glf5',
  LJ31: 'learjet', LJ35: 'learjet', LJ40: 'learjet', LJ45: 'learjet', LJ60: 'learjet',
  LJ70: 'learjet', LJ75: 'learjet', C25A: 'learjet', C25B: 'learjet', C25C: 'learjet',
  C510: 'learjet', C525: 'learjet', C550: 'learjet', C560: 'learjet', C56X: 'learjet',
  C680: 'learjet', C68A: 'learjet', C700: 'learjet', E55P: 'learjet', PC24: 'learjet',
  // Piston and light aircraft
  C150: 'cessna', C152: 'cessna', C162: 'cessna', C170: 'cessna', C172: 'cessna', C175: 'cessna',
  C177: 'cessna', C180: 'cessna', C182: 'cessna', C185: 'cessna', C206: 'cessna', C207: 'cessna',
  C208: 'cessna', C210: 'cessna', C72R: 'cessna', C82R: 'cessna',
  P28A: 'cessna', P28B: 'cessna', P28R: 'cessna', P28T: 'cessna', PA18: 'cessna', PA24: 'cessna',
  PA32: 'cessna', PA34: 'cessna', PA44: 'cessna', PA46: 'cessna',
  SR20: 'cessna', SR22: 'cessna', S22T: 'cessna',
  BE33: 'cessna', BE35: 'cessna', BE36: 'cessna', BE55: 'cessna', BE58: 'cessna', BE76: 'cessna',
  DA40: 'cessna', DA42: 'cessna', DA62: 'cessna', DV20: 'cessna', M20P: 'cessna', M20T: 'cessna',
  RV6: 'cessna', RV7: 'cessna', RV8: 'cessna', RV10: 'cessna', GLST: 'cessna', TBM7: 'cessna',
  TBM8: 'cessna', TBM9: 'cessna', PC12: 'cessna', P46T: 'cessna',
  // Military
  C130: 'c130', C30J: 'c130', L382: 'c130', C160: 'c130', A400: 'c130', C17: 'c130',
  K35R: 'c130', KC35: 'c130', C5M: 'c130', P8: 'c130', E3TF: 'c130', E3CF: 'c130',
  F15: 'f15', F16: 'f15', F18: 'f15', F22A: 'f15', F35: 'f15', FA18: 'f15', EUFI: 'f15',
  F5: 'f5', F5EF: 'f5', T38: 'f5', HAWK: 'f5',
  F111: 'f11', B1: 'f11', B2: 'f11',
};

/** ADS-B emitter category to icon file — the set is named for these directly. */
const BY_CATEGORY: Record<string, string> = {
  A0: 'a0', A1: 'a1', A2: 'a2', A3: 'a3', A4: 'a4', A5: 'a5', A6: 'a6', A7: 'a7',
  B0: 'b0', B1: 'b1', B2: 'b2', B3: 'b3', B4: 'b4',
  C0: 'c0', C1: 'c0', C2: 'c0', C3: 'c0', C4: 'c0', C5: 'c0', C6: 'c0', C7: 'c0',
};

/** Drawn size in CSS pixels, by icon. Heavies read larger, light aircraft smaller. */
const ICON_SIZE: Record<string, number> = {
  a380: 30, b747: 28, a340: 27, b777: 27, md11: 26, a330: 26, b787: 26, c130: 26, a5: 26, a4: 24,
  b767: 24, a320: 22, b737: 22, e195: 21, f100: 21, a3: 22,
  crjx: 20, erj: 20, dh8a: 20, glf5: 19, fa7x: 19, learjet: 18, a2: 19,
  f15: 19, f5: 18, f11: 20, a6: 19,
  cessna: 16, a1: 16, a0: 18,
  a7: 18,
  b0: 18, b1: 18, b2: 14, b3: 14, b4: 16,
  c0: 14,
};

const DEFAULT_ICON = 'a3';

export function iconForAircraft(aircraft: Aircraft): string {
  const type = aircraft.type?.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (type && BY_TYPE[type]) return BY_TYPE[type] as string;

  const category = aircraft.category?.toUpperCase();
  if (category && BY_CATEGORY[category]) return BY_CATEGORY[category] as string;

  // No type and no category: guess from altitude and speed rather than give up.
  if (aircraft.onGround) return 'c0';
  if ((aircraft.groundSpeed ?? 0) < 160 && (aircraft.altitude ?? 0) < 12000) return 'a1';
  return DEFAULT_ICON;
}

export function sizeForIcon(icon: string): number {
  return ICON_SIZE[icon] ?? 20;
}
